# Tasks with unknown status value
```dataview
table without id file.link as "Task", status as "Status"
from ""
where notetype = "task"
  and status != "open" and status != "inprogress" and status != "waiting" and status != "canceled" and status != "done"
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

# Notes stored in inbox
```dataview
table without id file.link as "Note", notetype as "Type"
from "1_inbox"
sort file.name asc
```

# Notes with unknown type
```dataview
table without id file.link as "Note", notetype as "Type", file.folder as "Folder"
from ""
where 1 = 1
  and notetype != "task" and notetype != "meeting" and notetype != "moc" and notetype != "diary" and notetype != "dailynote" and notetype != "knowhow"
  and !startswith(file.path, "9_meta")
  and !startswith(file.path, "8_attachments")
  and file.name != "README"
sort created asc
```