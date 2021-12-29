---
created: <% tp.date.now() %>
notetype: moc
---

```dataview
table without id notetype as "Type",
                 file.link as "Note",
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
from [[<%* tR += await this.app.workspace.getActiveFile().basename %>]]
sort created, file.name asc
```