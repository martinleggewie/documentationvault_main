---
created: <% tp.date.now() %>
notetype: meeting
---

# <%* tR += await this.app.workspace.getActiveFile().basename %>
- **Participants:** <% tp.file.cursor() %>TODO, <% tp.user.get_username() %>
- **Author:** <% tp.user.get_username() %>
- **Date:** [[<% tp.date.now() %>]]
- **Topics:** [[TODO]]

## Goal of the meeting
- 

## Before the meeting
- 

## The meeting
- 

## After the meeting
- 

## Next steps
- 

