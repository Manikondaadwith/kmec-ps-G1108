path = r'neurosentinel\app\onboarding\page.tsx'
with open(path, encoding='utf-8') as f:
    content = f.read()

idx = content.find("Hi, I'm SCOUT")
if idx >= 0:
    snippet = content[idx:idx+60]
    print('Found at idx', idx)
    print('Hex:', snippet.encode('utf-8').hex())
    print('Text:', repr(snippet))

    # Replace regardless of dash character type
    import re
    new_content = re.sub(
        r"Hi, I'm SCOUT\s*[\u2013\u2014\-]+\s*your clinical assistant inside NeuroSentinel AI\.",
        "Hi, I'm SCOUT \u2014 Seizure Clinical Operations & Understanding Tool. I'm your clinical assistant inside NeuroSentinel AI.",
        content
    )
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print('FIXED: opening message updated')
    else:
        print('Regex did not match')
else:
    print('String not found')
    idx2 = content.find('pushMessage')
    print(repr(content[idx2:idx2+100]))
