---
created: <% tp.date.now() %>
notetype: moc
---

```dataview
table without id created as "Created", file.link as "File", file.folder as "Folder", file.outlinks as "Links"
from [[<%* tR += await this.app.workspace.getActiveFile().basename %>]]
sort created asc
```