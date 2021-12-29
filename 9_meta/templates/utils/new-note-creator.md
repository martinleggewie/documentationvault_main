<%*
  let newfilename = await tp.system.prompt("Choose new file name", " " + tp.date.now(), false)
  if (newfilename > "") {
    tp.file.rename(newfilename)
  }
  
  var templatename = await tp.system.suggester(
    ["Meeting", "Task", "MOC", "Diary", "Knowhow"],
    ["[[meeting]]", "[[task]]", "[[moc]]", "[[diary]]", "[[knowhow]]"],
    false,
    "Choose template"
  );
  if (templatename > "") {
    var output = await tp.file.include(templatename)
    tR += output
  }
%>
