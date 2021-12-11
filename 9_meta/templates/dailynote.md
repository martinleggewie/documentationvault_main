# <% tp.file.title %>

```dataview
table without id notetype as "Type", file.link as "Note", created as "Created", file.outlinks as "Links"
from ""
where (created = date(<% tp.file.title %>) or contains(join(file.outlinks), <% tp.file.title %>))
  and (file.folder = "1_inbox" or file.folder = "3_meetings" or file.folder = "4_tasks")
sort file.name asc
```
