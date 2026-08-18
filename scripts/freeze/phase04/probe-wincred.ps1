# Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using FILETIME = System.Runtime.InteropServices.ComTypes.FILETIME;

public static class FieloraWinCredProbe
{
    private const int CRED_TYPE_GENERIC = 1;
    private const int CRED_PERSIST_LOCAL_MACHINE = 2;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL
    {
        public int Flags;
        public int Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWrite(ref CREDENTIAL credential, int flags);

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDelete(string target, int type, int flags);

    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr buffer);

    public static void Write(string target, byte[] secret)
    {
        IntPtr blob = Marshal.AllocHGlobal(secret.Length);
        try
        {
            Marshal.Copy(secret, 0, blob, secret.Length);
            var credential = new CREDENTIAL
            {
                Flags = 0,
                Type = CRED_TYPE_GENERIC,
                TargetName = target,
                Comment = "Fielora Phase 04 bounded freeze probe",
                CredentialBlobSize = secret.Length,
                CredentialBlob = blob,
                Persist = CRED_PERSIST_LOCAL_MACHINE,
                AttributeCount = 0,
                Attributes = IntPtr.Zero,
                TargetAlias = null,
                UserName = "Fielora Freeze Probe"
            };
            if (!CredWrite(ref credential, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        finally
        {
            for (int i = 0; i < secret.Length; i++) Marshal.WriteByte(blob, i, 0);
            Marshal.FreeHGlobal(blob);
        }
    }

    public static byte[] Read(string target)
    {
        IntPtr pointer;
        if (!CredRead(target, CRED_TYPE_GENERIC, 0, out pointer))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            var credential = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
            var result = new byte[credential.CredentialBlobSize];
            Marshal.Copy(credential.CredentialBlob, result, 0, result.Length);
            return result;
        }
        finally
        {
            CredFree(pointer);
        }
    }

    public static void Delete(string target, bool allowMissing)
    {
        if (!CredDelete(target, CRED_TYPE_GENERIC, 0))
        {
            int error = Marshal.GetLastWin32Error();
            if (!(allowMissing && error == 1168)) throw new Win32Exception(error);
        }
    }
}
'@

function Test-EqualBytes {
    param([byte[]]$Left, [byte[]]$Right)
    if ($Left.Length -ne $Right.Length) { return $false }
    $difference = 0
    for ($index = 0; $index -lt $Left.Length; $index++) {
        $difference = $difference -bor ($Left[$index] -bxor $Right[$index])
    }
    return $difference -eq 0
}

$target = "Fielora/freeze-probe/$([Guid]::NewGuid())"
$smallSecret = [Text.Encoding]::UTF8.GetBytes("synthetic-fielora-wincred-probe")
$boundedSecret = New-Object byte[] 2048
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($boundedSecret) } finally { $random.Dispose() }
$smallRead = $null
$boundedRead = $null
$deleted = $false

try {
    [FieloraWinCredProbe]::Write($target, $smallSecret)
    $smallRead = [FieloraWinCredProbe]::Read($target)
    if (-not (Test-EqualBytes $smallSecret $smallRead)) {
        throw 'Small credential read-back mismatch'
    }

    [FieloraWinCredProbe]::Write($target, $boundedSecret)
    $boundedRead = [FieloraWinCredProbe]::Read($target)
    if (-not (Test-EqualBytes $boundedSecret $boundedRead)) {
        throw '2048-byte credential replacement/read-back mismatch'
    }

    [FieloraWinCredProbe]::Delete($target, $false)
    $deleted = $true
    try {
        $unexpected = [FieloraWinCredProbe]::Read($target)
        [Array]::Clear($unexpected, 0, $unexpected.Length)
        throw 'Credential remained readable after delete'
    }
    catch [ComponentModel.Win32Exception] {
        if ($_.Exception.NativeErrorCode -ne 1168) { throw }
    }

    [ordered]@{
        result = 'PASS'
        type = 'CRED_TYPE_GENERIC'
        persist = 'CRED_PERSIST_LOCAL_MACHINE'
        createRead = 'PASS'
        replaceRead2048 = 'PASS'
        deleteUnreadable = 'PASS'
        fieloraProductLimitBytes = 2048
        winCredSystemLimitBytes = 2560
        targetPrefix = 'Fielora/freeze-probe/'
        secretOutput = 'NONE'
    } | ConvertTo-Json
}
finally {
    if (-not $deleted) {
        [FieloraWinCredProbe]::Delete($target, $true)
    }
    if ($null -ne $smallRead) { [Array]::Clear($smallRead, 0, $smallRead.Length) }
    if ($null -ne $boundedRead) { [Array]::Clear($boundedRead, 0, $boundedRead.Length) }
    [Array]::Clear($smallSecret, 0, $smallSecret.Length)
    [Array]::Clear($boundedSecret, 0, $boundedSecret.Length)
}
