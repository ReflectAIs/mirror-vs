
#!/usr/bin/env python3
data = open('src/webview/sidebar.js', 'r', encoding='utf-8', newline='\n').read()

marker = '\n  // Drag-and-Drop Image Support'
first_idx = data.find(marker)
second_idx = data.find(marker, first_idx + 1)
print(f'First at {first_idx}, Second at {second_idx}')
print(f'Lines: {data[:second_idx].count(chr(10)) + 1}')

func_marker = '\nfunction attachImage(base64)'
func_idx = data.find(func_marker, second_idx)
print(f'Function at {func_idx}, Line: {data[:func_idx].count(chr(10)) + 1}')

# Remove from second marker start to just before function
new_data = data[:second_idx] + data[func_idx:]
open('src/webview/sidebar.js', 'w', encoding='utf-8', newline='\n').write(new_data)
print('Done!')
