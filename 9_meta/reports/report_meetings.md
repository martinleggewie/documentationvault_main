
# All meetings
```dataview
table without id created as "Created", file.link as "Meeting", file.outlinks as "Topics"
from ""
where notetype = "meeting" and file.folder != "9_meta/templates"
sort created asc
```

