import re
import os

file_path = 'app/onboarding/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Highlight styles
content = content.replace(
    """    return {
      opacity: 1,
      transform: 'translateY(-4px)',
      borderColor: 'rgba(0,240,255,0.38)',
      boxShadow: '0 0 0 1px rgba(0,240,255,0.2), 0 24px 60px rgba(0,0,0,0.36), 0 0 40px rgba(0,240,255,0.12)',
    }""",
    """    return {
      opacity: 1,
      transform: 'translateY(-4px)',
      borderColor: 'var(--accent-primary)',
      boxShadow: 'var(--shadow-card-hover)',
    }"""
)

content = content.replace(
    """    return {
      opacity: 0.34,
      transform: 'scale(0.985)',
      borderColor: 'rgba(255,255,255,0.05)',
      boxShadow: 'none',
    }""",
    """    return {
      opacity: 0.5,
      transform: 'scale(0.985)',
      borderColor: 'var(--border-subtle)',
      boxShadow: 'none',
    }"""
)

content = content.replace(
    """    return {
      opacity: 1,
      transform: 'none',
      borderColor: 'rgba(255,255,255,0.08)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
    }""",
    """    return {
      opacity: 1,
      transform: 'none',
      borderColor: 'var(--border-default)',
      boxShadow: 'var(--shadow-card)',
    }"""
)

# Background neo-gradients
content = re.sub(r'radial-gradient\(circle, rgba\(0,240,255,[^\)]+\) 0%, transparent 68%\)', 'none', content)
content = re.sub(r'radial-gradient\(circle, rgba\(255,184,0,[^\)]+\) 0%, transparent 70%\)', 'none', content)
content = re.sub(r'linear-gradient\(rgba\(0,240,255,[^\)]+\) 1px, transparent 1px\), linear-gradient\(90deg, rgba\(0,240,255,[^\)]+\) 1px, transparent 1px\)', 'none', content)

# Panel backgrounds and borders
content = re.sub(r"linear-gradient\(180deg, rgba\(14,16,24,0\.9[^\)]+\), rgba\(8,10,15,0\.9[^\)]+\)\)", "rgba(255, 255, 255, 0.7)", content)
content = re.sub(r"linear-gradient\(180deg, rgba\(19,22,31,0\.9[^\)]+\), rgba\(11,13,18,0\.9[^\)]+\)\)", "rgba(255, 255, 255, 0.5)", content)
content = content.replace("background: 'rgba(10,10,15,0.86)'", "background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(20px)'")

content = content.replace("borderColor: 'rgba(0,240,255,0.14)'", "borderColor: 'var(--border-default)'")
content = content.replace("borderColor: 'rgba(0,240,255,0.16)'", "borderColor: 'var(--border-default)'")
content = content.replace("borderColor: 'rgba(255,255,255,0.06)'", "borderColor: 'var(--border-subtle)'")
content = content.replace("borderColor: 'rgba(255,255,255,0.08)'", "borderColor: 'var(--border-default)'")
content = content.replace("borderColor: 'rgba(255,51,102,0.22)'", "borderColor: 'var(--accent-danger)'")
content = content.replace("background: 'rgba(255,51,102,0.08)'", "background: 'var(--accent-danger-light)'")


# Heavy shadows
content = re.sub(r"0 2[0-9]px [0-9]+px rgba\(0,0,0,0\.45\), 0 0 40px rgba\(0,240,255,0\.08\)", "var(--shadow-card)", content)

# Chat messages
content = content.replace(
    """background: 'rgba(0,240,255,0.07)',
                            border: '1px solid rgba(0,240,255,0.12)',
                            color: 'var(--text-primary)',""",
    """background: 'var(--bg-inset)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-heading)',"""
)
content = content.replace(
    """background: 'linear-gradient(135deg, rgba(0,240,255,0.18), rgba(255,184,0,0.16))',
                            border: '1px solid rgba(0,240,255,0.18)',
                            color: '#F7FBFF',""",
    """background: 'var(--accent-primary)',
                            border: '1px solid var(--accent-primary)',
                            color: '#FFFFFF',"""
)
content = content.replace("color: '#0A0A0F'", "color: '#FFFFFF'")
content = content.replace("background: 'rgba(255,255,255,0.02)'", "background: 'var(--bg-inset)'")
content = content.replace("background: 'rgba(255,255,255,0.03)'", "background: 'var(--bg-inset)'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated Onboarding Design!')
