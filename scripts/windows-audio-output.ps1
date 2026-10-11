$ErrorActionPreference = 'Stop'

try {
  $source = @'
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCom {}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  int RegisterEndpointNotificationCallback(IntPtr client);
  int UnregisterEndpointNotificationCallback(IntPtr client);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
interface IMMDevice {
  int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, out IntPtr interfacePointer);
  int OpenPropertyStore(int access, out IntPtr store);
  int GetId(out IntPtr id);
  int GetState(out int state);
}

public static class AurafyDefaultAudioEndpoint {
  public static string GetId() {
    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    IMMDevice device = null;
    IntPtr idPointer = IntPtr.Zero;
    try {
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
      Marshal.ThrowExceptionForHR(device.GetId(out idPointer));
      return Marshal.PtrToStringUni(idPointer);
    } finally {
      if (idPointer != IntPtr.Zero) Marshal.FreeCoTaskMem(idPointer);
      if (device != null) Marshal.ReleaseComObject(device);
      Marshal.ReleaseComObject(enumerator);
    }
  }
}
'@

  Add-Type -TypeDefinition $source -ErrorAction Stop
  $endpointId = [AurafyDefaultAudioEndpoint]::GetId()
  $instanceId = "SWD\MMDEVAPI\$endpointId"
  $parent = (Get-PnpDeviceProperty -InstanceId $instanceId -KeyName 'DEVPKEY_Device_Parent' -ErrorAction Stop).Data
  $isBluetooth = [bool]($parent -match '^(BTHENUM|BTHHFENUM|BTHLEDEVICE)\\')
  [pscustomobject]@{ available = $true; isBluetooth = $isBluetooth } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ available = $false; isBluetooth = $false } | ConvertTo-Json -Compress
}
