---
created: <% tp.date.now() %>
notetype: dailynote
---

# <% tp.file.title %>

```dataview
table without id notetype as "Type",
                 file.link as "Note",
                 created as "Created",
                 join(
                   sort(
                     filter(
                       file.outlinks,
                       (x) => (
                         contains(meta(x).path, "prs_") or
                         contains(meta(x).path, "sys_") or
                         contains(meta(x).path, "ogu_") or
                         contains(meta(x).path, "tpc_")
                       )
                     )  
                   ),
                   " "
                 ) as "MOCs",
                 join(
                   sort(
                     filter(
                       file.outlinks,
                       (x) => (
                         regexmatch(".*/\d\d\d\d-\d\d-\d\d.md", meta(x).path)
                       )
                     )
                   ),
                   " "
                 ) as "Dates",
                 join(
                   sort(
                     filter(
                       file.outlinks,
                       (x) => (
                         !contains(meta(x).path, "prs_") and
                         !contains(meta(x).path, "sys_") and
                         !contains(meta(x).path, "ogu_") and
                         !contains(meta(x).path, "tpc_") and
                         !contains(meta(x).path, "attachments") and
                         !regexmatch(".*/\d\d\d\d-\d\d-\d\d.md", meta(x).path)
                       )
                     )
                   ),  
                   " "
                 ) as "Referenced Notes"
from ""
where (created = date(<% tp.file.title %>) or contains(join(file.outlinks), "<% tp.file.title %>"))
  and notetype != "dailynote"
  and file.folder != "9_meta"
  and file.folder != "9_meta/reports"
  and file.folder != "9_meta/templates"
  and file.folder != "9_meta/templates/private"
sort file.folder, file.name asc
```
