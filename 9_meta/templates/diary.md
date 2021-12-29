---
created: <% tp.date.now() %>
notetype: diary
---

# <%* tR += await this.app.workspace.getActiveFile().basename %>
| .                 | .                                                        |
| ----------------- | -------------------------------------------------------- |
| **Author:**       | <% tp.user.get_username() %>                             |
| **Date:**         | [[<% tp.date.now() %>]]                                  |
| **Topics:**       | [[<% tp.file.cursor() %>TODO]]                                                 |

- 