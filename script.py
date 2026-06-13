import base64
with open(r'C:\Users\HP\.gemini\antigravity-ide\brain\511a7e38-ef48-4cbb-acba-42a82f664424\happy_robot_mascot_1781233432382.png', 'rb') as f:
    img_data = f.read()
b64_str = base64.b64encode(img_data).decode('utf-8')

with open(r'd:\github\mirror-vs\src\webview\sidebar.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

import re
new_html = re.sub(
    r'<div class=\"buddy-avatar\" id=\"buddy-avatar\">.*?<\/svg>\s*<\/div>',
    f'<div class=\"buddy-avatar\" id=\"buddy-avatar\"><img src=\"data:image/png;base64,{b64_str}\" style=\"width: 100%; height: 100%; border-radius: 50%; object-fit: cover;\" /></div>',
    html_content,
    flags=re.DOTALL
)

with open(r'd:\github\mirror-vs\src\webview\sidebar.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
