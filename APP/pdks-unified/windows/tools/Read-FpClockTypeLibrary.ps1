# KY PDKS — FP_CLOCK.ocx x86 Type Library keşfi (metotları ÇALIŞTIRMAZ)
# COM register, cihaz bağlanma, log okuma/silme veya Firebird/TNF yazma YOK.
# OCX üretici bileşeni GitHub'a veya loga kopyalanmaz.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$OcxPath
)
$ErrorActionPreference='Stop'
$ocx=[IO.Path]::GetFullPath($OcxPath)
if([IO.Path]::GetFileName($ocx) -ine 'FP_CLOCK.ocx' -or
   !(Test-Path -LiteralPath $ocx -PathType Leaf)){
    throw 'FP_CLOCK_OCX_FILE_REQUIRED'
}
if([IntPtr]::Size -ne 4){
    throw 'X86_POWERSHELL_REQUIRED_USE_SYSWOW64_WINDOWSPOWERSHELL'
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class KyPdksTypeLibraryReadOnly {
  public enum REGKIND { DEFAULT=0, REGISTER=1, NONE=2 }
  [DllImport("oleaut32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
  public static extern void LoadTypeLibEx(
    [MarshalAs(UnmanagedType.LPWStr)] string file,
    REGKIND kind, out ITypeLib library);
}
'@ -ErrorAction Stop
$library=$null
$interfaces=@()
try {
    # REGKIND.NONE does not register OCX in the Windows registry.
    [KyPdksTypeLibraryReadOnly]::LoadTypeLibEx($ocx,
      [KyPdksTypeLibraryReadOnly+REGKIND]::NONE,[ref]$library)
    $count=$library.GetTypeInfoCount()
    for($i=0;$i -lt $count;$i++){
        $typeInfo=$null;$attrPtr=[IntPtr]::Zero
        try {
            $library.GetTypeInfo($i,[ref]$typeInfo)
            $typeInfo.GetTypeAttr([ref]$attrPtr)
            $attr=[Runtime.InteropServices.Marshal]::PtrToStructure(
              $attrPtr,[type][Runtime.InteropServices.ComTypes.TYPEATTR])
            $name='';$doc='';$help=0;$helpFile=''
            $typeInfo.GetDocumentation(-1,[ref]$name,[ref]$doc,[ref]$help,[ref]$helpFile)
            $methods=@()
            for($j=0;$j -lt $attr.cFuncs;$j++){
                $funcPtr=[IntPtr]::Zero
                try{
                    $typeInfo.GetFuncDesc($j,[ref]$funcPtr)
                    $func=[Runtime.InteropServices.Marshal]::PtrToStructure(
                      $funcPtr,[type][Runtime.InteropServices.ComTypes.FUNCDESC])
                    $names=[string[]]::new(32);$nameCount=0
                    $typeInfo.GetNames($func.memid,$names,32,[ref]$nameCount)
                    $methods+=([PSCustomObject]@{
                        name=if($nameCount){$names[0]}else{'UNKNOWN'}
                        memberId=$func.memid
                        argumentCount=$func.cParams
                        invokeKind=[string]$func.invkind
                    })
                } finally{
                    if($funcPtr -ne [IntPtr]::Zero){
                      $typeInfo.ReleaseFuncDesc($funcPtr)
                    }
                }
            }
            $interfaces+=([PSCustomObject]@{
                typeName=$name;typeKind=[string]$attr.typekind;members=$methods
            })
        } finally {
            if($typeInfo){
                if($attrPtr -ne [IntPtr]::Zero){$typeInfo.ReleaseTypeAttr($attrPtr)}
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($typeInfo)
            }
        }
    }
} finally {
    if($library){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($library)}
}
([PSCustomObject]@{
    source='FP_CLOCK_TYPELIB_UNVERIFIED_READ_ONLY'
    typeLibraryReadable=$true
    interfaces=$interfaces
    actualReadMethodTested=$false
    noDeviceContact=$true
    noComRegistration=$true
    noDeviceOrFdbOrTnfWrite=$true
})|ConvertTo-Json -Depth 8
Write-Output 'RESULT=TYPELIB_METADATA_ONLY_NOT_PHYSICAL_READ_PROOF'
