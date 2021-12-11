
# Overdue tasks
```dataview
table without id status as "Status", file.link as "Task", deadline as "Deadline", file.outlinks as "Links"
from ""
where notetype = "task" and file.folder != "9_meta/templates"
  and date(deadline) < date(today)
  and status != "cancelled" and status != "closed"
sort deadline asc
```

# Not closed tasks
```dataview
table without id status as "Status", file.link as "Task", deadline as "Deadline", file.outlinks as "Links"
from ""
where notetype = "task" and file.folder != "9_meta/templates"
  and status = "open" or status = "in-progress" or status = "waiting"
sort deadline asc
```

# Closed tasks
```dataview
table without id status as "Status", file.link as "Task", deadline as "Deadline", file.outlinks as "Links"
from ""
where notetype = "task" and file.folder != "9_meta/templates"
  and status = "cancelled" or status = "closed"
sort deadline asc
```

# All tasks
```dataview
table without id file.link as "Task", status as "Status", created as "Created", deadline as "Deadline"
from ""
where notetype = "task" and file.folder != "9_meta/templates"
sort deadline asc
```

