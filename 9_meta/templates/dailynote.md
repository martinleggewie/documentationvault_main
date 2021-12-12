# <% tp.file.title %>

```dataview
table without id notetype as "Type", file.link as "Note", file.folder as "Folder", created as "Created", file.outlinks as "Links"
from ""
where (created = date(<% tp.file.title %>) or contains(join(file.outlinks), <% tp.file.title %>))
  and file.folder != "9_meta"
  and file.folder != "9_meta/reports"
  and file.folder != "9_meta/templates"
  and file.folder != "9_meta/templates/private"
sort file.folder, file.name asc
```
