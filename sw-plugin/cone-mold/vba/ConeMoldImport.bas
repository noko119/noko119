'==============================================================================
' 锥管模具 — SolidWorks VBA：读 cone.mold.v0 JSON，旋转生成内锥 + 外套分段
' 入口宏：ConeMoldImportFromJson
'
' 用法：
'   1. 网页「导出 SW JSON」得到 cone-mold-v0-*.json
'   2. SolidWorks：工具 → 宏 → 新建/编辑 → 导入本 .bas
'   3. 运行 ConeMoldImportFromJson，粘贴 JSON 完整路径
'
' 说明：
'   - Web 单位 mm；SW API 草图/特征单位为【米】→ 全部 /1000
'   - 原点在模具顶面中心，+Y 向上，顶→底为 -Y
'   - v0：内锥实心旋转体 + 各外套薄壁旋转体（多实体）；接头螺纹细节二期
'==============================================================================
Option Explicit

Private Const SCHEMA As String = "cone.mold.v0"
Private Const MM2M As Double = 0.001

Private Type CmSleeve
    Idx As Long
    OuterOd As Double
    Z0 As Double
    Z1 As Double
    ConeAtTop As Double
    ConeAtBot As Double
End Type

Private Type CmCone
    TopDia As Double
    BottomDia As Double
    Z0 As Double
    Z1 As Double
End Type

'--- 入口 -----------------------------------------------------------------
Public Sub ConeMoldImportFromJson()
    Dim swApp As SldWorks.SldWorks
    Dim swModel As SldWorks.ModelDoc2
    Dim filePath As String
    Dim json As String
    Dim errMsg As String
    Dim cone As CmCone
    Dim sleeves() As CmSleeve
    Dim nSleeve As Long
    Dim totalH As Double
    Dim i As Long

    Set swApp = Application.SldWorks

    filePath = BrowseJsonFile()
    If Len(filePath) = 0 Then Exit Sub

    json = ReadTextFileUtf8(filePath)
    If Len(json) = 0 Then
        MsgBox "文件为空或读取失败。", vbCritical
        Exit Sub
    End If

    If Not ParseConeMoldJson(json, cone, sleeves, nSleeve, totalH, errMsg) Then
        MsgBox errMsg, vbCritical
        Exit Sub
    End If

    Set swModel = swApp.NewDocument(swApp.GetUserPreferenceStringValue(swUserPreferenceStringValue_e.swDefaultTemplatePart), 0, 0, 0)
    If swModel Is Nothing Then
        ' 回退：用空模板名
        Set swModel = swApp.NewPart
    End If
    If swModel Is Nothing Then
        MsgBox "无法新建零件。请先在 SW 中设置默认零件模板。", vbCritical
        Exit Sub
    End If

    swModel.SetAddToDB True
    swModel.SetDisplayWhenAdded False

    If Not CreateConeBody(swModel, cone, errMsg) Then
        MsgBox "创建内锥失败：" & errMsg, vbCritical
        GoTo CLEANUP
    End If

    For i = 0 To nSleeve - 1
        If Not CreateSleeveBody(swModel, sleeves(i), errMsg) Then
            MsgBox "创建外套" & sleeves(i).Idx & "失败：" & errMsg, vbCritical
            GoTo CLEANUP
        End If
    Next i

    swModel.SetAddToDB False
    swModel.SetDisplayWhenAdded True
    swModel.ViewZoomtofit2
    swModel.ForceRebuild3 False

    MsgBox "锥管模具导入完成。" & vbCrLf & _
           "内锥 ø" & Format$(cone.TopDia, "0.000") & "→ø" & Format$(cone.BottomDia, "0.000") & vbCrLf & _
           "外套节数：" & nSleeve & vbCrLf & _
           "总高：" & Format$(totalH, "0.###") & " mm" & vbCrLf & _
           "文件：" & filePath & vbCrLf & vbCrLf & _
           "提示：特征树中为多实体；螺纹/止口细节可在二期宏中细化。", vbInformation
    Exit Sub

CLEANUP:
    swModel.SetAddToDB False
    swModel.SetDisplayWhenAdded True
End Sub

'--- 文件 -----------------------------------------------------------------
Private Function BrowseJsonFile() As String
    Dim p As String
    p = Trim$(InputBox( _
        "请输入 cone.mold.v0 JSON 完整路径：" & vbCrLf & _
        "例如：D:\...\demo-cone-mold-v0.json", _
        "Cone Mold Import"))
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
    stm.Type = 2
    stm.Charset = "utf-8"
    stm.Open
    stm.LoadFromFile filePath
    ReadTextFileUtf8 = stm.ReadText
    stm.Close
    Exit Function
FALLBACK:
    Dim f As Integer
    Dim s As String
    f = FreeFile
    Open filePath For Input As #f
    s = Input$(LOF(f), #f)
    Close #f
    ReadTextFileUtf8 = s
End Function

'--- JSON 解析（仅 cone.mold.v0 子集） ------------------------------------
Private Function ParseConeMoldJson(ByVal json As String, ByRef cone As CmCone, _
    ByRef sleeves() As CmSleeve, ByRef nSleeve As Long, ByRef totalH As Double, _
    ByRef errMsg As String) As Boolean

    Dim schema As String
    Dim coneObj As String
    Dim sleevesArr As String
    Dim i As Long
    Dim obj As String
    Dim objs() As String
    Dim cnt As Long

    errMsg = ""
    schema = JsonStr(json, "schema")
    If schema <> SCHEMA Then
        errMsg = "schema 应为 " & SCHEMA & "，实际：" & schema
        ParseConeMoldJson = False
        Exit Function
    End If

    totalH = JsonNum(json, "totalHeight")
    coneObj = JsonObject(json, "cone")
    If Len(coneObj) = 0 Then
        errMsg = "缺少 cone 对象"
        ParseConeMoldJson = False
        Exit Function
    End If
    cone.TopDia = JsonNum(coneObj, "topDia")
    cone.BottomDia = JsonNum(coneObj, "bottomDia")
    cone.Z0 = JsonNum(coneObj, "z0")
    cone.Z1 = JsonNum(coneObj, "z1")
    If cone.TopDia <= 0 Or cone.BottomDia <= 0 Or cone.Z1 <= cone.Z0 Then
        errMsg = "cone 尺寸无效"
        ParseConeMoldJson = False
        Exit Function
    End If

    sleevesArr = JsonArray(json, "sleeves")
    cnt = SplitObjects(sleevesArr, objs)
    If cnt < 1 Then
        errMsg = "sleeves 为空"
        ParseConeMoldJson = False
        Exit Function
    End If
    ReDim sleeves(0 To cnt - 1)
    For i = 0 To cnt - 1
        obj = objs(i)
        sleeves(i).Idx = CLng(JsonNum(obj, "index"))
        sleeves(i).OuterOd = JsonNum(obj, "outerOd")
        sleeves(i).Z0 = JsonNum(obj, "z0")
        sleeves(i).Z1 = JsonNum(obj, "z1")
        sleeves(i).ConeAtTop = JsonNum(obj, "coneAtTop")
        sleeves(i).ConeAtBot = JsonNum(obj, "coneAtBot")
        If sleeves(i).OuterOd <= 0 Or sleeves(i).Z1 <= sleeves(i).Z0 Then
            errMsg = "sleeve " & sleeves(i).Idx & " 尺寸无效"
            ParseConeMoldJson = False
            Exit Function
        End If
    Next i
    nSleeve = cnt
    ParseConeMoldJson = True
End Function

'--- 建模 -----------------------------------------------------------------
Private Function CreateConeBody(ByVal swModel As SldWorks.ModelDoc2, ByRef cone As CmCone, ByRef errMsg As String) As Boolean
    Dim y0 As Double, y1 As Double
    Dim r0 As Double, r1 As Double
    Dim boolstatus As Boolean
    Dim feat As Object

    On Error GoTo FAIL
    y0 = -cone.Z0 * MM2M
    y1 = -cone.Z1 * MM2M
    r0 = cone.TopDia * 0.5 * MM2M
    r1 = cone.BottomDia * 0.5 * MM2M

    boolstatus = swModel.Extension.SelectByID2("前视基准面", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then boolstatus = swModel.Extension.SelectByID2("Front Plane", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then boolstatus = swModel.Extension.SelectByID2("Plane1", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then
        errMsg = "无法选中前视基准面"
        CreateConeBody = False
        Exit Function
    End If

    swModel.SketchManager.InsertSketch True
    ' 旋转轴（Y）
    swModel.SketchManager.CreateCenterLine 0, y0 + 0.01, 0, 0, y1 - 0.01, 0
    ' 梯形剖面（右侧）
    swModel.SketchManager.CreateLine 0, y0, 0, r0, y0, 0
    swModel.SketchManager.CreateLine r0, y0, 0, r1, y1, 0
    swModel.SketchManager.CreateLine r1, y1, 0, 0, y1, 0
    swModel.SketchManager.CreateLine 0, y1, 0, 0, y0, 0
    swModel.ClearSelection2 True
    ' 选中心线作轴
    boolstatus = swModel.Extension.SelectByID2("Line1", "SKETCHSEGMENT", 0, 0, 0, False, 4, Nothing, 0)
    Set feat = swModel.FeatureManager.FeatureRevolve2( _
        True, True, False, False, False, False, _
        0, 0, 6.28318530717959, 0, False, False, 0.01, 0.01, _
        0, 0, 0, True, True, True)
    If feat Is Nothing Then
        errMsg = "FeatureRevolve2 返回空（内锥）"
        CreateConeBody = False
        Exit Function
    End If
    feat.Name = "CONE_CORE"
    CreateConeBody = True
    Exit Function
FAIL:
    errMsg = Err.Description
    CreateConeBody = False
End Function

Private Function CreateSleeveBody(ByVal swModel As SldWorks.ModelDoc2, ByRef s As CmSleeve, ByRef errMsg As String) As Boolean
    Dim y0 As Double, y1 As Double
    Dim ro As Double, ri0 As Double, ri1 As Double
    Dim boolstatus As Boolean
    Dim feat As Object

    On Error GoTo FAIL
    y0 = -s.Z0 * MM2M
    y1 = -s.Z1 * MM2M
    ro = s.OuterOd * 0.5 * MM2M
    ri0 = s.ConeAtTop * 0.5 * MM2M
    ri1 = s.ConeAtBot * 0.5 * MM2M
    If ro <= ri0 Or ro <= ri1 Then
        errMsg = "外套外径不足以包住锥面"
        CreateSleeveBody = False
        Exit Function
    End If

    boolstatus = swModel.Extension.SelectByID2("前视基准面", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then boolstatus = swModel.Extension.SelectByID2("Front Plane", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then boolstatus = swModel.Extension.SelectByID2("Plane1", "PLANE", 0, 0, 0, False, 0, Nothing, 0)
    If Not boolstatus Then
        errMsg = "无法选中前视基准面"
        CreateSleeveBody = False
        Exit Function
    End If

    swModel.SketchManager.InsertSketch True
    swModel.SketchManager.CreateCenterLine 0, y0 + 0.005, 0, 0, y1 - 0.005, 0
    ' 外壁 + 内锥孔（闭合环）
    swModel.SketchManager.CreateLine ri0, y0, 0, ro, y0, 0
    swModel.SketchManager.CreateLine ro, y0, 0, ro, y1, 0
    swModel.SketchManager.CreateLine ro, y1, 0, ri1, y1, 0
    swModel.SketchManager.CreateLine ri1, y1, 0, ri0, y0, 0
    swModel.ClearSelection2 True
    boolstatus = swModel.Extension.SelectByID2("Line1", "SKETCHSEGMENT", 0, 0, 0, False, 4, Nothing, 0)
    ' merge=False → 新实体
    Set feat = swModel.FeatureManager.FeatureRevolve2( _
        False, True, False, False, False, False, _
        0, 0, 6.28318530717959, 0, False, False, 0.01, 0.01, _
        0, 0, 0, True, True, True)
    If feat Is Nothing Then
        errMsg = "FeatureRevolve2 返回空（外套" & s.Idx & "）"
        CreateSleeveBody = False
        Exit Function
    End If
    feat.Name = "SLEEVE_" & s.Idx
    CreateSleeveBody = True
    Exit Function
FAIL:
    errMsg = Err.Description
    CreateSleeveBody = False
End Function

'--- 极简 JSON 工具 --------------------------------------------------------
Private Function JsonStr(ByVal json As String, ByVal key As String) As String
    Dim p As Long, q As Long, r As Long
    p = InStr(1, json, """" & key & """", vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p, json, ":")
    If p = 0 Then Exit Function
    p = InStr(p, json, """")
    If p = 0 Then Exit Function
    q = InStr(p + 1, json, """")
    If q = 0 Then Exit Function
    JsonStr = Mid$(json, p + 1, q - p - 1)
End Function

Private Function JsonNum(ByVal json As String, ByVal key As String) As Double
    Dim p As Long, q As Long, ch As String, buf As String
    p = InStr(1, json, """" & key & """", vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p, json, ":")
    If p = 0 Then Exit Function
    p = p + 1
    Do While p <= Len(json)
        ch = Mid$(json, p, 1)
        If ch <> " " And ch <> vbTab And ch <> vbCr And ch <> vbLf Then Exit Do
        p = p + 1
    Loop
    q = p
    Do While q <= Len(json)
        ch = Mid$(json, q, 1)
        If (ch >= "0" And ch <= "9") Or ch = "." Or ch = "-" Or ch = "+" Or ch = "e" Or ch = "E" Then
            q = q + 1
        Else
            Exit Do
        End If
    Loop
    buf = Mid$(json, p, q - p)
    If Len(buf) = 0 Then Exit Function
    JsonNum = CDbl(Val(buf))
End Function

Private Function JsonObject(ByVal json As String, ByVal key As String) As String
    Dim p As Long, i As Long, depth As Long, ch As String, startPos As Long
    p = InStr(1, json, """" & key & """", vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p, json, "{")
    If p = 0 Then Exit Function
    startPos = p
    depth = 0
    For i = p To Len(json)
        ch = Mid$(json, i, 1)
        If ch = "{" Then depth = depth + 1
        If ch = "}" Then
            depth = depth - 1
            If depth = 0 Then
                JsonObject = Mid$(json, startPos, i - startPos + 1)
                Exit Function
            End If
        End If
    Next i
End Function

Private Function JsonArray(ByVal json As String, ByVal key As String) As String
    Dim p As Long, i As Long, depth As Long, ch As String, startPos As Long
    Dim inStrq As Boolean
    p = InStr(1, json, """" & key & """", vbTextCompare)
    If p = 0 Then Exit Function
    p = InStr(p, json, "[")
    If p = 0 Then Exit Function
    startPos = p
    depth = 0
    inStrq = False
    For i = p To Len(json)
        ch = Mid$(json, i, 1)
        If ch = """" Then inStrq = Not inStrq
        If Not inStrq Then
            If ch = "[" Then depth = depth + 1
            If ch = "]" Then
                depth = depth - 1
                If depth = 0 Then
                    JsonArray = Mid$(json, startPos, i - startPos + 1)
                    Exit Function
                End If
            End If
        End If
    Next i
End Function

Private Function SplitObjects(ByVal arrJson As String, ByRef outs() As String) As Long
    Dim i As Long, depth As Long, ch As String
    Dim startPos As Long, cnt As Long
    Dim inStrq As Boolean
    Dim body As String

    If Len(arrJson) < 2 Then Exit Function
    body = Mid$(arrJson, 2, Len(arrJson) - 2)
    ReDim outs(0 To 63)
    depth = 0
    inStrq = False
    startPos = 0
    cnt = 0
    For i = 1 To Len(body)
        ch = Mid$(body, i, 1)
        If ch = """" Then inStrq = Not inStrq
        If Not inStrq Then
            If ch = "{" Then
                If depth = 0 Then startPos = i
                depth = depth + 1
            ElseIf ch = "}" Then
                depth = depth - 1
                If depth = 0 And startPos > 0 Then
                    If cnt > UBound(outs) Then ReDim Preserve outs(0 To cnt + 32)
                    outs(cnt) = Mid$(body, startPos, i - startPos + 1)
                    cnt = cnt + 1
                    startPos = 0
                End If
            End If
        End If
    Next i
    If cnt > 0 Then ReDim Preserve outs(0 To cnt - 1)
    SplitObjects = cnt
End Function
