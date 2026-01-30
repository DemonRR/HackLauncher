!macro preInit
  ; 保持默认安装路径，让用户可以自定义
  SetOutPath $INSTDIR
!macroend

!macro customInit
  ; 备份 config 和 logs 文件夹
  IfFileExists "$INSTDIR\config" 0 noConfigBackup
  
  ; 创建临时目录用于备份
  CreateDirectory "$TEMP\HackLauncherBackup\config"
  CreateDirectory "$TEMP\HackLauncherBackup\logs"
  
  ; 备份 config 文件夹
  CopyFiles /SILENT /FILESONLY "$INSTDIR\config\*.*" "$TEMP\HackLauncherBackup\config\"
  
  ; 备份 logs 文件夹
  IfFileExists "$INSTDIR\logs" 0 noLogsBackup
  CopyFiles /SILENT /FILESONLY "$INSTDIR\logs\*.*" "$TEMP\HackLauncherBackup\logs\"
  DetailPrint "已备份日志文件到临时目录"

noLogsBackup:
  ; 记录备份完成
  DetailPrint "已备份配置文件到临时目录"

noConfigBackup:
!macroend

!macro customInstall
  ; 安装后恢复 config 和 logs 文件夹
  IfFileExists "$TEMP\HackLauncherBackup\config\*.*" 0 noConfigRestore
  
  ; 确保目标 config 文件夹存在
  CreateDirectory "$INSTDIR\config"
  
  ; 恢复 config 文件夹
  CopyFiles /SILENT /FILESONLY "$TEMP\HackLauncherBackup\config\*.*" "$INSTDIR\config\"
  DetailPrint "已恢复配置文件"

noConfigRestore:
  ; 恢复 logs 文件夹
  IfFileExists "$TEMP\HackLauncherBackup\logs\*.*" 0 noLogsRestore
  
  ; 确保目标 logs 文件夹存在
  CreateDirectory "$INSTDIR\logs"
  
  ; 恢复 logs 文件夹
  CopyFiles /SILENT /FILESONLY "$TEMP\HackLauncherBackup\logs\*.*" "$INSTDIR\logs\"
  DetailPrint "已恢复日志文件"

noLogsRestore:
  ; 清理临时备份目录
  RMDir /r "$TEMP\HackLauncherBackup"
!macroend

; 使用.onVerifyInstDir函数处理目录验证和自动填充
; 这个函数会在用户选择目录后、进入下一步之前被调用
Function .onVerifyInstDir
  ; 检查是否为空
  StrCmp $INSTDIR "" done
  
  ; 获取路径长度
  StrLen $0 $INSTDIR
  
  ; 检查是否为驱动器根目录格式 (如 D: 或 D:\)
  ; 如果路径长度为2，是驱动器根目录 (如 D:)
  StrCmp $0 2 addToDrive
  ; 如果路径长度为3，检查是否为 D:\ 格式
  StrCmp $0 3 checkDriveRoot
  ; 其他情况，检查路径末尾是否已包含 HackLauncher
  Goto checkExisting
  
addToDrive:
  ; 路径是 D: 格式，添加 \HackLauncher
  StrCpy $INSTDIR "$INSTDIR\HackLauncher"
  Goto done
  
checkDriveRoot:
  ; 检查路径是否为 D:\ 格式（第3个字符应该是反斜杠）
  StrCpy $1 $INSTDIR 1 2
  StrCmp $1 "\" addToDriveRoot checkExisting
  
addToDriveRoot:
  ; 路径是 D:\ 格式，需要去掉末尾的反斜杠，然后添加 \HackLauncher
  ; 提取前两个字符（D:），然后添加 \HackLauncher
  StrCpy $2 $INSTDIR 2
  StrCpy $INSTDIR "$2\HackLauncher"
  Goto done
  
checkExisting:
  ; 检查路径末尾是否已包含 HackLauncher
  StrLen $2 "HackLauncher"
  
  ; 如果路径长度小于应用名称长度，直接添加
  IntCmp $0 $2 addAppName checkEnd checkEnd
  
checkEnd:
  ; 计算应该提取的起始位置（从末尾往前提取应用名称长度）
  IntOp $3 $0 - $2
  
  ; 检查前面是否有反斜杠（完整路径应该是 ...\HackLauncher）
  IntOp $4 $3 - 1
  StrCpy $5 $INSTDIR 1 $4
  
  ; 如果前面有反斜杠，提取末尾部分检查是否匹配
  StrCmp $5 "\" checkSuffix addAppName
  
checkSuffix:
  ; 提取末尾部分检查是否已包含 HackLauncher
  StrCpy $6 $INSTDIR $2 $3
  StrCmp $6 "HackLauncher" done addAppName
  
addAppName:
  ; 检查路径是否以反斜杠结尾
  IntOp $7 $0 - 1
  StrCpy $8 $INSTDIR 1 $7
  StrCmp $8 "\" addWithoutSlash addWithSlash
  
addWithSlash:
  ; 路径不以反斜杠结尾，添加 \HackLauncher
  StrCpy $INSTDIR "$INSTDIR\HackLauncher"
  Goto done
  
addWithoutSlash:
  ; 路径以反斜杠结尾，去掉末尾反斜杠，然后添加 \HackLauncher
  ; 提取除最后一个字符外的所有字符
  IntOp $7 $0 - 1
  StrCpy $INSTDIR $INSTDIR $7
  StrCpy $INSTDIR "$INSTDIR\HackLauncher"
  Goto done
  
done:
FunctionEnd

; 使用.onSelChange函数作为备用处理，当目录选择改变时也会触发
Function .onSelChange
  ; 调用相同的验证逻辑
  Call .onVerifyInstDir
FunctionEnd
