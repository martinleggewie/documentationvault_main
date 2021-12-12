---
created: 2021-12-12
notetype: moc
---

**Note:** Unlike other MOCs, the TODO MOC actually should not show any linked notes because this would mean that there is still a TODO left somewhere in some note. So, the dataview table below should not show any entry.

```dataview
table without id created as "Created", file.link as "File", file.folder as "Folder", file.outlinks as "Links"
from [[TODO]]
where file.folder != "9_meta/templates" and file.folder != "9_meta/templates/private"
sort created asc
```
