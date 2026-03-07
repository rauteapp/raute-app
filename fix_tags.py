import re

with open('app/orders/page.tsx', 'r') as f:
    content = f.read()

content = re.sub(r'<\s+div\s+className\s*=\s*', '<div className=', content)
content = re.sub(r'</div\s+>', '</div>', content)
content = re.sub(r'<\s+header\s+>', '<header>', content)
content = re.sub(r'</header\s+>', '</header>', content)

with open('app/orders/page.tsx', 'w') as f:
    f.write(content)

