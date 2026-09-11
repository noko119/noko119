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
        If LCase$(nodes(i).TypeName) = "drive" And nodes(i).IsMainDrive Then
            mainCount = mainCount + 1
        End If
    Next i

    MsgBox "PIDM 路径导入完成。" & vbCrLf & _
           "节点数：" & nCount & vbCrLf & _
           "草图：" & SKETCH_NAME & vbCrLf & _
           "主驱动标记数：" & mainCount & "（应为 1）" & vbCrLf & _
           "文件：" & filePath, vbInformation
End Sub

'--- 节点结构 -------------------------------------------------------------
Private Type PidmNode
    Id As String
    Seq As Long
    X As Double
    Y As Double
    Z As Double
    TypeName As String
    IsMainDrive As Boolean
End Type

'--- 文件 -----------------------------------------------------------------
Private Function BrowseJsonFile() As String
    Dim fd As Object
    On Error Resume Next
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    If fd Is Nothing Then
        ' SolidWorks VBA 有时无 mso 常量，退回 InputBox
        BrowseJsonFile = Trim$(InputBox("请输入 JSON 完整路径：", "PIDM Import"))
        Exit Function
    End If
    On Error GoTo 0
    With fd
        .Title = "选择 PIDM 路径 JSON"
        .AllowMultiSelect = False
        .Filters.Clear
        .Filters.Add "JSON", "*.json"
        If .Show = -1 Then
            BrowseJsonFile = .SelectedItems(1)
        Else
            BrowseJsonFile = ""
        End If
    End With
End Function

Private Function ReadTextFileUtf8(ByVal filePath As String) As String
    Dim ts As Object
    Dim stm As Object
    On Error GoTo FALLBACK
    ' ADODB.Stream 读 UTF-8
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
    f = FreeFile
    Open filePath For Input As #f
    ReadTextFileUtf8 = Input$(LOF(f), f)
    Close #f
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
    Dim okTxt As String
    Dim itemsTxt As String
    Dim errors As String

    schema = JsonGetString(pathJson, "schema")
    If Len(schema) > 0 Then
        If InStr(1, schema, "pidm.path", vbTextCompare) = 0 And _
           InStr(1, schema, "pidm.path", vbTextCompare) = 0 Then
            ' 兼容历史拼写 pidm.path / pidm.path
            If InStr(1, schema, "path.v0", vbTextCompare) = 0 Then
                errMsg = "schema 不是路径包：" & schema
                ValidateSchemaAndClosure = False
                Exit Function
            End If
        End If
    End If

    closureTxt = JsonGetObjectText(pathJson, "closure")
    If Len(closureTxt) = 0 Then
        ValidateSchemaAndClosure = True
        Exit Function
    End If

    okTxt = LCase$(JsonGetRaw(closureTxt, "ok"))
    itemsTxt = JsonGetArrayText(closureTxt, "items")
    errors = CollectClosureErrors(itemsTxt)

    If Len(errors) > 0 Then
        errMsg = "闭环检查失败，拒绝写入：" & vbCrLf & errors
        ValidateSchemaAndClosure = False
        Exit Function
    End If

    If okTxt = "false" Then
        ' ok=false 但无 error 级别时：警告仍继续
        errMsg = ""
    End If
    ValidateSchemaAndClosure = True
End Function

Private Function CollectClosureErrors(ByVal itemsArr As String) As String
    Dim parts() As String
    Dim i As Long
    Dim obj As String
    Dim lvl As String
    Dim code As String
    Dim msg As String
    Dim out As String

    If Len(itemsArr) = 0 Then Exit Function
    parts = SplitJsonObjects(itemsArr)
    For i = LBound(parts) To UBound(parts)
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

    arr = JsonGetArrayText(pathJson, "nodes")
    If Len(arr) = 0 Then
        errMsg = "未找到 nodes 数组。"
        ParseNodes = 0
        Exit Function
    End If

    objs = SplitJsonObjects(arr)
    n = UBound(objs) - LBound(objs) + 1
    If n <= 0 Then
        errMsg = "nodes 为空。"
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
        nodes(i).TypeName = JsonGetString(o, "type")
        nodes(i).IsMainDrive = JsonGetBool(o, "is_main_drive") Or _
                               JsonGetBool(o, "is_mainDrive") Or _
                               JsonGetBool(o, "mainDrive")
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
    Dim pts() As SldWorks.SketchPoint
    Dim boolstatus As Boolean

    On Error GoTo FAIL
    Set swSkMgr = swModel.SketchManager

    ' 若已有同名草图：选中并编辑；否则新建 3D 草图
    Set feat = FindFeatureByName(swModel, SKETCH_NAME)
    If Not feat Is Nothing Then
        boolstatus = feat.Select2(False, 0)
        swModel.EditSketch
        ' 清除旧几何：退出后删除特征再重建更稳
        swModel.ClearSelection2 True
        swModel.Insert3DSketch True ' 退出编辑
        feat.Select2 False, 0
        swModel.EditDelete
    End If

    swModel.Insert3DSketch True
    ReDim pts(0 To nCount - 1)

    For i = 0 To nCount - 1
        ' API 单位：米（与 Web 一致）
        Set pts(i) = swSkMgr.CreatePoint(nodes(i).X, nodes(i).Y, nodes(i).Z)
        If pts(i) Is Nothing Then
            errMsg = "CreatePoint 失败 @ " & nodes(i).Id
            GoTo FAIL
        End If
    Next i

    For i = 0 To nCount - 2
        swSkMgr.CreateLine pts(i).X, pts(i).Y, pts(i).Z, _
                           pts(i + 1).X, pts(i + 1).Y, pts(i + 1).Z
    Next i

    swModel.Insert3DSketch True ' 退出并保存草图

    ' 重命名最新草图特征
    Set feat = swModel.FeatureByPositionReverse(0)
    If Not feat Is Nothing Then
        On Error Resume Next
        feat.Name = SKETCH_NAME
        On Error GoTo FAIL
    End If

    swModel.ForceRebuild3 False
    BuildOrUpdateSkeleton = True
    Exit Function
FAIL:
    If Len(errMsg) = 0 Then errMsg = Err.Description
    On Error Resume Next
    swModel.Insert3DSketch True
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

'==============================================================================
' 极简 JSON 子集工具（仅字符串/数字/布尔/对象/数组提取）
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

Private Function JsonGetRaw(ByVal json As String, ByVal key As String) As String
    Dim p As Long, p2 As Long, p3 As Long
    Dim k As String
    k = """" & key & """"
    p = InStr(1, json, k, vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p, json, ":", vbBinaryCompare)
    If p = 0 Then Exit Function
    p = p + 1
    Do While p <= Len(json) And Mid$(json, p, 1) Like "[ " & vbTab & vbCr & vbLf & "]"
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
        JsonGetRaw = "" ' 用专用函数
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
    startBrace = InStr(p, json, "{", vbBinaryCompare)
    If startBrace = 0 Then Exit Function
    JsonGetObjectText = ExtractBalanced(json, startBrace, "{", "}")
End Function

Private Function JsonGetArrayText(ByVal json As String, ByVal key As String) As String
    Dim p As Long, startBracket As Long
    Dim k As String
    Dim body As String
    k = """" & key & """"
    p = InStr(1, json, k, vbTextCompare)
    If p = 0 Then Exit Function
    startBracket = InStr(p, json, "[", vbBinaryCompare)
    If startBracket = 0 Then Exit Function
    body = ExtractBalanced(json, startBracket, "[", "]")
    ' 去掉两侧括号，留给 SplitJsonObjects
    If Len(body) >= 2 Then
        JsonGetArrayText = Mid$(body, 2, Len(body) - 2)
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

Private Function SplitJsonObjects(ByVal arrInner As String) As String()
    Dim i As Long, depth As Long, ch As String, inStrq As Boolean
    Dim startI As Long
    Dim tmp As String
    Dim out() As String
    Dim n As Long

    arrInner = Trim$(arrInner)
    If Len(arrInner) = 0 Then
        ReDim out(0 To -1)
        SplitJsonObjects = out
        Exit Function
    End If

    n = -1
    startI = 1
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
                    ReDim Preserve out(0 To n)
                    out(n) = tmp
                End If
            End If
        End If
    Next i
    If n < 0 Then ReDim out(0 To -1)
    SplitJsonObjects = out
End Function

Private Function StripQuotes(ByVal s As String) As String
    s = Trim$(s)
    If Len(s) >= 2 And Left$(s, 1) = """" And Right$(s, 1) = """" Then
        StripQuotes = Mid$(s, 2, Len(s) - 2)
    Else
        StripQuotes = s
    End If
End Function
