import re

with open('app/my-editor/client-page.tsx', 'r') as f:
    content = f.read()

content = content.replace('</div >', '</div>')
content = content.replace('</PullToRefresh >', '</PullToRefresh>')

with open('app/my-editor/client-page.tsx', 'w') as f:
    f.write(content)

