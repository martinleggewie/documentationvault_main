# {{title}}

```dataview
table without id created as "Created", file.link as "File", file.folder as "Folder"
from "3_meetings"
where created = date({{title}})
sort file.name asc
```