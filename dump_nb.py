import json, sys

nb_path = r"NeuroSentinel_AI_production.ipynb"
out_path = r"nb_dump.txt"

with open(nb_path, encoding="utf-8") as f:
    nb = json.load(f)

cells = nb["cells"]
lines = [f"TOTAL CELLS: {len(cells)}\n"]
for i, c in enumerate(cells):
    src = "".join(c["source"])
    lines.append(f"\n=== CELL {i} [{c['cell_type']}] ===\n{src}\n")

with open(out_path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print(f"Done. {len(cells)} cells written to {out_path}")
