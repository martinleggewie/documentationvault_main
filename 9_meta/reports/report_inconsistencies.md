# Tasks with unknown status value
```dataview
table without id file.link as "Task", status as "Status"
from ""
where notetype = "task"
  and status != "open" and status != "in-progress" and status != "waiting" and status != "cancelled" and status != "closed"
sort deadline asc
```

# Tasks not stored in destined folder
```dataview
table without id file.link as "Task", file.folder as "Folder"
from ""
where notetype = "task"
  and file.folder != "4_tasks" and file.folder != "9_meta/templates"
sort deadline asc
```

# Meetings not stored in destined folder
```dataview
table without id file.link as "Meeting", file.folder as "Folder"
from ""
where notetype = "meeting"
  and file.folder != "3_meetings" and file.folder != "9_meta/templates"
sort deadline asc
```