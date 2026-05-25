
$content = Get-Content "src/webview/sidebar.js" -Raw

# Remove the second duplicate block starting from line 503
# The duplicate starts at "  // Drag-and-Drop Image Support" (second occurrence)
# and ends at the line before "function attachImage(base64) {" (second occurrence)

$pattern = [regex]::Escape("  // Drag-and-Drop Image Support`r`n  promptInput.addEventListener('dragover', (e) => {`r`n    e.preventDefault();`r`n    e.stopPropagation();`r`n    promptInput.style.borderColor = '#a855f7';`r`n    promptInput.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.3)';`r`n  });`r`n`r`n  promptInput.addEventListener('dragleave', (e) => {`r`n    e.preventDefault();`r`n    e.stopPropagation();`r`n    promptInput.style.borderColor = '';`r`n    promptInput.style.boxShadow = '';`r`n  });`r`n`r`n  promptInput.addEventListener('drop', (e) => {`r`n    e.preventDefault();`r`n    e.stopPropagation();`r`n    promptInput.style.borderColor = '';`r`n    promptInput.style.boxShadow = '';`r`n    `r`n    const files = e.dataTransfer.files;`r`n    for (let i = 0; i < files.length; i++) {`r`n      if (files[i].type.indexOf('image') !== -1) {`r`n        const reader = new FileReader();`r`n        reader.onload = function(event) {`r`n          const base64 = event.target.result.split(',')[1];`r`n          attachImage(base64);`r`n        };`r`n        reader.readAsDataURL(files[i]);`r`n      }`r`n    }`r`n  });`r`n`r`n")

# Find the second occurrence
$firstIndex = $content.IndexOf($pattern)
if ($firstIndex -eq -1) {
    Write-Host "First occurrence not found"
    exit 1
}

$secondIndex = $content.IndexOf($pattern, $firstIndex + $pattern.Length)
if ($secondIndex -eq -1) {
    Write-Host "Second occurrence not found"
    exit 1
}

# Remove from second occurrence to just before "function attachImage(base64)"
$afterSecond = $content.Substring($secondIndex + $pattern.Length)
$content = $content.Substring(0, $secondIndex) + $afterSecond

Set-Content "src/webview/sidebar.js" $content -NoNewline
Write-Host "Duplicate removed successfully"
