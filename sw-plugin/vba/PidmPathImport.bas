'==============================================================================
' PIDM — SolidWorks VBA：从 JSON 读路径并生成/更新 3D 骨架草图
' 模块名建议：PidmPathImport
' 入口宏：PidmImportPathFromJson
'
' 用法：
'   1. 打开 Z-up 装配
'   2. 工具 → 宏 → 运行 → 选本宏
'   3. 选择 Web 导出的 pidm.path.v0 JSON（或 samples/demo-path-v0.json）
'
' 说明：
'   - SW API 草图坐标单位为【米】，与 Web 一致，不要 ×1000
'   - 本解析器只覆盖 PIDM 路径包子集（非通用 JSON 库）
'   - 阶段 A：只画折线骨架；滚筒块插入见 PSEUDOCODE 阶段 B
'==============================================================================
Option Explicit

Private Const SKETCH_NAME As String = "PIDM_PATH_SKEL"
Private Const SCHEMA_PATH As String = "pidm.path.v0"
Private Const SCHEMA_BUNDLE As String = "pidm.bundle.v0"

'--- 入口 -----------------------------------------------------------------
Public Sub PidmImportPathFromJson()
    Dim swApp As SldWorks.SldWorks
    Dim swModel As SldWorks.ModelDoc2
    Dim filePath As String
    Dim json As String
    Dim pathJson As String
    Dim nodes() As PidmNode
    Dim nCount As Long
    Dim errMsg As String
    Dim i As Long
    Dim mainCount As Long

    Set swApp = Application.SldWorks
    Set swModel = swApp.ActiveDoc
    If swModel Is Nothing Then
        MsgBox "请先打开一个装配或零件（推荐装配，Z 向上）。", vbExclamation
        Exit Sub
    End If

    filePath = BrowseJsonFile()
    If Len(filePath) = 0 Then Exit Sub

    json = ReadTextFileUtf8(filePath)
    If Len(json) = 0 Then
        MsgBox "文件为空或读取失败。", vbCritical
        Exit Sub
    End If

    pathJson = ExtractPathObject(json, errMsg)
    If Len(errMsg) > 0 Then
        MsgBox errMsg, vbCritical
        Exit Sub
    End If

    If Not ValidateSchemaAndClosure(pathJson, errMsg) Then
        MsgBox errMsg, vbCritical
        Exit Sub
    End If

    nCount = ParseNodes(pathJson, nodes, errMsg)
    If nCount < 2 Then
        MsgBox "节点不足（需要 ≥2）。" & vbCrLf & errMsg, vbCritical
        Exit Sub
    End If

    SortNodesBySeq nodes, nCount

    If Not BuildOrUpdateSkeleton(swModel, nodes, nCount, errMsg) Then
        MsgBox "写骨架失败：" & errMsg, vbCritical
        Exit Sub
    End If

    mainCount = 0
    For i = 0 To nCount - 1
        If LCase$(nodes(i).NodeType) = "drive" And nodes(i).IsMainDrive Then
            mainCount = mainCount + 1
        End If
    Next i

    MsgBox "PIDM 路径导入完成。" & vbCrLf & _
           "节点数：" & nCount & vbCrLf & _
           "草图：" & SKETCH_NAME & vbCrLf & _
           "主驱动标记数：" & mainCount & "（应为 1）" & vbCrLf & _
           "文件：" & filePath, vbInformation
End Sub

'--- 节点结构（NodeType 不用 TypeName，避免与 VBA 函数冲突） -------------
Private Type PidmNode
    Id As String
    Seq As Long
    X As Double
    Y As Double
    Z As Double
    NodeType As String
    IsMainDrive As Boolean
End Type

'--- 文件（SolidWorks VBA 无 Word/Excel FileDialog，改用 InputBox） ------
Private Function BrowseJsonFile() As String
    Dim p As String
    p = Trim$(InputBox( _
        "请输入 PIDM 路径 JSON 的完整路径：" & vbCrLf & _
        "例如：D:\...\sw-plugin\samples\demo-path-v0.json", _
        "PIDM Import"))
    ' 去掉可能被粘贴进来的引号
    If Len(p) >= 2 Then
        If Left$(p, 1) = """" And Right$(p, 1) = """" Then
            p = Mid$(p, 2, Len(p) - 2)
        End If
    End If
    BrowseJsonFile = p
End Function

Private Function ReadTextFileUtf8(ByVal filePath As String) As String
    Dim stm As Object
    On Error GoTo FALLBACK
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2 ' text
    stm.Charset = "UTF-8"
    stm.Open
    stm.LoadFromFile filePath
    ReadTextFileUtf8 = stm.ReadText
    stm.Close
    Exit Function
FALLBACK:
    Dim f As Integer
    On Error GoTo FAIL
    f = FreeFile
    Open filePath For Input As #f
    ReadTextFileUtf8 = Input$(LOF(f), f)
    Close #f
    Exit Function
FAIL:
    On Error Resume Next
    Close #f
    ReadTextFileUtf8 = ""
End Function

'--- JSON 子集：取出 path 对象文本 ---------------------------------------
Private Function ExtractPathObject(ByVal json As String, ByRef errMsg As String) As String
    Dim schema As String
    errMsg = ""
    schema = JsonGetString(json, "schema")
    If schema = SCHEMA_BUNDLE Or InStr(1, schema, "bundle", vbTextCompare) > 0 Then
        ExtractPathObject = JsonGetObjectText(json, "path")
        If Len(ExtractPathObject) = 0 Then
            errMsg = "bundle 中未找到 path 对象。"
        End If
    Else
        ExtractPathObject = json
    End If
End Function

Private Function ValidateSchemaAndClosure(ByVal pathJson As String, ByRef errMsg As String) As Boolean
    Dim schema As String
    Dim closureTxt As String
    Dim itemsTxt As String
    Dim errors As String

    schema = JsonGetString(pathJson, "schema")
    If Len(schema) > 0 Then
        If InStr(1, schema, "path.v0", vbTextCompare) = 0 And _
           InStr(1, schema, "pidm.path", vbTextCompare) = 0 Then
            errMsg = "schema 不是路径包：" & schema
            ValidateSchemaAndClosure = False
            Exit Function
        End If
    End If

    closureTxt = JsonGetObjectText(pathJson, "closure")
    If Len(closureTxt) = 0 Then
        ValidateSchemaAndClosure = True
        Exit Function
    End If

    itemsTxt = JsonGetArrayInner(closureTxt, "items")
    errors = CollectClosureErrors(itemsTxt)

    If Len(errors) > 0 Then
        errMsg = "闭环检查失败，拒绝写入：" & vbCrLf & errors
        ValidateSchemaAndClosure = False
        Exit Function
    End If

    ValidateSchemaAndClosure = True
End Function

Private Function CollectClosureErrors(ByVal itemsArr As String) As String
    Dim parts() As String
    Dim i As Long
    Dim n As Long
    Dim obj As String
    Dim lvl As String
    Dim code As String
    Dim msg As String
    Dim out As String

    If Len(Trim$(itemsArr)) = 0 Then Exit Function
    n = SplitJsonObjects(itemsArr, parts)
    If n <= 0 Then Exit Function

    For i = 0 To n - 1
        obj = parts(i)
        lvl = LCase$(JsonGetString(obj, "level"))
        If lvl = "error" Then
            code = JsonGetString(obj, "code")
            msg = JsonGetString(obj, "message")
            If Len(msg) = 0 Then msg = JsonGetString(obj, "msg")
            out = out & "- [" & code & "] " & msg & vbCrLf
        End If
    Next i
    CollectClosureErrors = out
End Function

'--- 解析 nodes -----------------------------------------------------------
Private Function ParseNodes(ByVal pathJson As String, ByRef nodes() As PidmNode, ByRef errMsg As String) As Long
    Dim arr As String
    Dim objs() As String
    Dim i As Long
    Dim n As Long
    Dim o As String

    arr = JsonGetArrayInner(pathJson, "nodes")
    If Len(Trim$(arr)) = 0 Then
        errMsg = "未找到 nodes 数组。"
        ParseNodes = 0
        Exit Function
    End If

    n = SplitJsonObjects(arr, objs)
    If n <= 0 Then
        errMsg = "nodes 为空或无法解析。"
        ParseNodes = 0
        Exit Function
    End If

    ReDim nodes(0 To n - 1)
    For i = 0 To n - 1
        o = objs(i)
        nodes(i).Id = JsonGetString(o, "id")
        nodes(i).Seq = CLng(Val(JsonGetRaw(o, "seq")))
        nodes(i).X = Val(JsonGetRaw(o, "x"))
        nodes(i).Y = Val(JsonGetRaw(o, "y"))
        nodes(i).Z = Val(JsonGetRaw(o, "z"))
        nodes(i).NodeType = JsonGetString(o, "type")
        nodes(i).IsMainDrive = JsonGetBool(o, "is_main_drive") Or _
                               JsonGetBool(o, "is_mainDrive") Or _
                               JsonGetBool(o, "mainDrive") Or _
                               (LCase$(JsonGetString(o, "drive_role")) = "main")
        If Len(nodes(i).Id) = 0 Then nodes(i).Id = "n" & CStr(i + 1)
        If nodes(i).Seq = 0 Then nodes(i).Seq = i + 1
    Next i
    ParseNodes = n
End Function

Private Sub SortNodesBySeq(ByRef nodes() As PidmNode, ByVal nCount As Long)
    Dim i As Long, j As Long
    Dim tmp As PidmNode
    For i = 0 To nCount - 2
        For j = i + 1 To nCount - 1
            If nodes(j).Seq < nodes(i).Seq Then
                tmp = nodes(i)
                nodes(i) = nodes(j)
                nodes(j) = tmp
            End If
        Next j
    Next i
End Sub

'--- 写骨架草图 -----------------------------------------------------------
Private Function BuildOrUpdateSkeleton(ByVal swModel As SldWorks.ModelDoc2, _
                                       ByRef nodes() As PidmNode, _
                                       ByVal nCount As Long, _
                                       ByRef errMsg As String) As Boolean
    Dim swSkMgr As SldWorks.SketchManager
    Dim feat As SldWorks.Feature
    Dim i As Long
    Dim x1 As Double, y1 As Double, z1 As Double
    Dim x2 As Double, y2 As Double, z2 As Double
    Dim skSeg As Object

    On Error GoTo FAIL
    Set swSkMgr = swModel.SketchManager

    ' 已有同名草图则删除后重建（避免双真相）
    Set feat = FindFeatureByName(swModel, SKETCH_NAME)
    If Not feat Is Nothing Then
        feat.Select2 False, 0
        swModel.EditDelete
        Set feat = Nothing
    End If

    swModel.ClearSelection2 True
    swModel.Insert3DSketch True

    ' 只建折线（点由线端点形成），避免点线重复几何
    For i = 0 To nCount - 2
        x1 = nodes(i).X: y1 = nodes(i).Y: z1 = nodes(i).Z
        x2 = nodes(i + 1).X: y2 = nodes(i + 1).Y: z2 = nodes(i + 1).Z
        Set skSeg = swSkMgr.CreateLine(x1, y1, z1, x2, y2, z2)
        If skSeg Is Nothing Then
            errMsg = "CreateLine 失败 @ " & nodes(i).Id & " → " & nodes(i + 1).Id
            GoTo FAIL
        End If
    Next i

    swModel.Insert3DSketch True ' 退出并保存草图

    ' 重命名：找最近创建的 3D 草图，不要盲目用 FeatureByPositionReverse(0)
    Set feat = FindNewest3DSketch(swModel)
    If Not feat Is Nothing Then
        On Error Resume Next
        feat.Name = SKETCH_NAME
        On Error GoTo FAIL
    Else
        errMsg = "已创建几何，但未能重命名草图为 " & SKETCH_NAME
        ' 不视为致命失败
    End If

    swModel.ForceRebuild3 False
    BuildOrUpdateSkeleton = True
    Exit Function
FAIL:
    If Len(errMsg) = 0 Then errMsg = Err.Description
    On Error Resume Next
    If Not swModel.GetActiveSketch2() Is Nothing Then
        swModel.Insert3DSketch True
    End If
    BuildOrUpdateSkeleton = False
End Function

Private Function FindFeatureByName(ByVal swModel As SldWorks.ModelDoc2, ByVal name As String) As SldWorks.Feature
    Dim feat As SldWorks.Feature
    Set feat = swModel.FirstFeature
    Do While Not feat Is Nothing
        If StrComp(feat.Name, name, vbTextCompare) = 0 Then
            Set FindFeatureByName = feat
            Exit Function
        End If
        Set feat = feat.GetNextFeature
    Loop
    Set FindFeatureByName = Nothing
End Function

Private Function FindNewest3DSketch(ByVal swModel As SldWorks.ModelDoc2) As SldWorks.Feature
    Dim feat As SldWorks.Feature
    Dim lastSk As SldWorks.Feature
    Dim t As String
    Set feat = swModel.FirstFeature
    Do While Not feat Is Nothing
        t = feat.GetTypeName2
        ' 3D 草图类型名一般为 "3DProfileFeature"
        If StrComp(t, "3DProfileFeature", vbTextCompare) = 0 Then
            Set lastSk = feat
        End If
        Set feat = feat.GetNextFeature
    Loop
    Set FindNewest3DSketch = lastSk
End Function

'==============================================================================
' 极简 JSON 子集工具
'==============================================================================
Private Function JsonGetString(ByVal json As String, ByVal key As String) As String
    Dim raw As String
    raw = JsonGetRaw(json, key)
    JsonGetString = StripQuotes(raw)
End Function

Private Function JsonGetBool(ByVal json As String, ByVal key As String) As Boolean
    Dim raw As String
    raw = LCase$(Trim$(JsonGetRaw(json, key)))
    JsonGetBool = (raw = "true")
End Function

Private Function IsJsonWhitespace(ByVal ch As String) As Boolean
    IsJsonWhitespace = (ch = " " Or ch = vbTab Or ch = vbCr Or ch = vbLf)
End Function

Private Function JsonGetRaw(ByVal json As String, ByVal key As String) As String
    Dim p As Long, p2 As Long
    Dim k As String
    k = """" & key & """"
    p = InStr(1, json, k, vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p + Len(k), json, ":", vbBinaryCompare)
    If p = 0 Then Exit Function
    p = p + 1
    Do While p <= Len(json) And IsJsonWhitespace(Mid$(json, p, 1))
        p = p + 1
    Loop
    If Mid$(json, p, 1) = """" Then
        p2 = p + 1
        Do While p2 <= Len(json)
            If Mid$(json, p2, 1) = """" And Mid$(json, p2 - 1, 1) <> "\" Then Exit Do
            p2 = p2 + 1
        Loop
        JsonGetRaw = Mid$(json, p, p2 - p + 1)
    ElseIf Mid$(json, p, 1) = "{" Or Mid$(json, p, 1) = "[" Then
        JsonGetRaw = ""
    Else
        p2 = p
        Do While p2 <= Len(json)
            Select Case Mid$(json, p2, 1)
                Case ",", "}", "]"
                    Exit Do
            End Select
            p2 = p2 + 1
        Loop
        JsonGetRaw = Trim$(Mid$(json, p, p2 - p))
    End If
End Function

Private Function JsonGetObjectText(ByVal json As String, ByVal key As String) As String
    Dim p As Long, startBrace As Long
    Dim k As String
    k = """" & key & """"
    p = InStr(1, json, k, vbTextCompare)
    If p = 0 Then Exit Function
    startBrace = InStr(p + Len(k), json, "{", vbBinaryCompare)
    If startBrace = 0 Then Exit Function
    JsonGetObjectText = ExtractBalanced(json, startBrace, "{", "}")
End Function

' 返回数组内部文本（不含两侧 []）
Private Function JsonGetArrayInner(ByVal json As String, ByVal key As String) As String
    Dim p As Long, startBracket As Long
    Dim k As String
    Dim body As String
    k = """" & key & """"
    p = InStr(1, json, k, vbTextCompare)
    If p = 0 Then Exit Function
    startBracket = InStr(p + Len(k), json, "[", vbBinaryCompare)
    If startBracket = 0 Then Exit Function
    body = ExtractBalanced(json, startBracket, "[", "]")
    If Len(body) >= 2 Then
        JsonGetArrayInner = Mid$(body, 2, Len(body) - 2)
    End If
End Function

Private Function ExtractBalanced(ByVal s As String, ByVal startPos As Long, _
                                 ByVal openCh As String, ByVal closeCh As String) As String
    Dim i As Long, depth As Long, ch As String, inStrq As Boolean
    depth = 0
    inStrq = False
    For i = startPos To Len(s)
        ch = Mid$(s, i, 1)
        If ch = """" Then
            If i = 1 Or Mid$(s, i - 1, 1) <> "\" Then inStrq = Not inStrq
        End If
        If Not inStrq Then
            If ch = openCh Then depth = depth + 1
            If ch = closeCh Then
                depth = depth - 1
                If depth = 0 Then
                    ExtractBalanced = Mid$(s, startPos, i - startPos + 1)
                    Exit Function
                End If
            End If
        End If
    Next i
End Function

' 返回对象个数；通过 ByRef parts() 输出。避免 ReDim 0 To -1（VBA 非法）
Private Function SplitJsonObjects(ByVal arrInner As String, ByRef parts() As String) As Long
    Dim i As Long, depth As Long, ch As String, inStrq As Boolean
    Dim startI As Long
    Dim tmp As String
    Dim n As Long

    arrInner = Trim$(arrInner)
    n = 0
    If Len(arrInner) = 0 Then
        SplitJsonObjects = 0
        Exit Function
    End If

    depth = 0
    inStrq = False
    For i = 1 To Len(arrInner)
        ch = Mid$(arrInner, i, 1)
        If ch = """" Then
            If i = 1 Or Mid$(arrInner, i - 1, 1) <> "\" Then inStrq = Not inStrq
        End If
        If Not inStrq Then
            If ch = "{" Then
                If depth = 0 Then startI = i
                depth = depth + 1
            ElseIf ch = "}" Then
                depth = depth - 1
                If depth = 0 Then
                    tmp = Mid$(arrInner, startI, i - startI + 1)
                    n = n + 1
                    ReDim Preserve parts(0 To n - 1)
                    parts(n - 1) = tmp
                End If
            End If
        End If
    Next i
    SplitJsonObjects = n
End Function

Private Function StripQuotes(ByVal s As String) As String
    s = Trim$(s)
    If Len(s) >= 2 And Left$(s, 1) = """" And Right$(s, 1) = """" Then
        StripQuotes = Mid$(s, 2, Len(s) - 2)
    Else
        StripQuotes = s
    End If
End Function
