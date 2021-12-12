<%*
  let newfilename = await tp.system.prompt("Choose new file name", "", false)
  if (newfilename > "") {
    tp.file.rename(newfilename)
  }
  
  var templatename = await tp.system.suggester(
    ["Meeting", "Task", "MOC"],
    ["[[meeting]]", "[[task]]", "[[moc]]"],
    false,
    "Choose template"
  );
  if (templatename > "") {
    var output = await tp.file.include(templatename)
    tR += output
  }
%>
