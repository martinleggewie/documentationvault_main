# Topics
```dataview
table without id file.link as "Topic"
from ""
where notetype = "moc" and file.folder != "9_meta/templates"
  and contains(file.name, "tpc_")
sort file.name asc
```

# Systems
```dataview
table without id file.link as "System"
from ""
where notetype = "moc" and file.folder != "9_meta/templates"
  and contains(file.name, "sys_")
sort file.name asc
```

# Persons
```dataview
table without id file.link as "Person"
from ""
where notetype = "moc" and file.folder != "9_meta/templates"
  and contains(file.name, "prs_")
sort file.name asc
```

# Organisation Units
```dataview
table without id file.link as "Organisation Unit"
from ""
where notetype = "moc" and file.folder != "9_meta/templates"
  and contains(file.name, "ogu_")
sort file.name asc
```