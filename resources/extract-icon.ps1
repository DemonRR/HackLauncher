# extract-icon.ps1
param(
    [string]$exePath,
    [string]$outputPath
)

try {
    # Load necessary assembly
    Add-Type -AssemblyName System.Drawing
    
    # Extract icon
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exePath)
    
    if ($icon) {
        # Save icon as PNG
        $bmp = $icon.ToBitmap()
        $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        
        # Cleanup
        $bmp.Dispose()
        $icon.Dispose()
        
        # Return success
        Write-Output "Success"
    } else {
        Write-Output "Failed to extract icon"
    }
} catch {
    Write-Output "Error: $($_.Exception.Message)"
}