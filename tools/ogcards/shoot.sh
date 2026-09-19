#!/bin/sh
# Re-make the share cards. Needs the preview server on 8899 and Chrome.
#   sh tools/ogcards/shoot.sh            every card
#   sh tools/ogcards/shoot.sh dale       just one
set -e
out=$(mktemp -d)
for who in ${*:-team stanley tommy stephanie dale ricky}; do
  google-chrome --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=1200,630 --virtual-time-budget=4000 \
    --screenshot="$out/$who.png" "http://localhost:8899/tools/ogcards/card.html?who=$who" 2>/dev/null
  python3 -c "
from PIL import Image
im = Image.open('$out/$who.png').convert('RGB')
assert im.size == (1200, 630), im.size
im.save('assets/img/og-$who.jpg', quality=86, optimize=True, progressive=True)
print('assets/img/og-$who.jpg')"
done
