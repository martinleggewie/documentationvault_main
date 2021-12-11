---
notetype: moc
---

```dataview
table without id created as "Created", file.link as "File", file.folder as "Folder", file.outlinks as "Links"
from [[<% tp.file.title %>]]
sort created asc
```