# Closed tasks
```dataview
table without id status as "Status",
                 deadline as "Deadline",
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
                 created as "Created"
from ""
where notetype = "task" and file.folder != "9_meta/templates"
  and status = "canceled" or status = "done"
sort deadline asc
```
