
# All diary entries
```dataview
table without id created as "Created",
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
                 ) as "Dates"                 
from ""
where notetype = "diary" and file.folder != "9_meta/templates"
sort created, file.name asc
```
