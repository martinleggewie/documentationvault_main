#!/bin/zsh

echo ""
echo "This script creates dailynotes for a given time range."
echo ""
echo "WATCH OUT!"
echo "    Before you run this script, make sure that you have closed any Obsidian instance for this very vault."
echo "    Otherwise Obsidian will interfere and update the just created files before this script can update them, and this"
echo "    race condition will lead to broken results."
echo ""
echo "At the moment everything is configured in the script - if you want to change something, please adjust the script accordingly."
echo ""

currentpath=`pwd`
destinationpath=$currentpath"/../../2_dailynotes"
templatefile=$currentpath"/../templates/dailynote.md"

startdate="2020-01-01"
enddate="2021-12-31"
amountofdays="9999"

echo "Start date:   $startdate"
echo "End date:     $enddate"
echo "Current path: $currentpath"
echo

for i in {0..$amountofdays}
do
    currentdate=`date -j -v +$i"d" -f "%Y-%m-%d" +"%Y-%m-%d" $startdate`
    currentdayofweek=`date -j -v +$i"d" -f "%Y-%m-%d" +"%a" $startdate`
    echo $currentdate - $currentdayofweek

    if [[ $currentdate > $enddate ]]
    then
        echo "End date $enddate reached - stopping the script."
        return
    fi

    if [[ $currentdayofweek == "Sat" || $currentdayofweek == "Sa" || $currentdayofweek == "Sun" || $currentdayofweek == "So" ]]
    then
        continue
    fi

    destinationfile=$destinationpath"/"$currentdate".md"
    echo "    Dailynote file to be created: "$destinationfile

    if [[ -f $destinationfile ]]
    then
        echo "        file already exists --> skipping the creation"
    else
        echo "        file does not exist --> creating a file"
        cp $templatefile $destinationfile

        # set the created date
        sed -i "" "s/<% tp.date.now() %>/$currentdate/g" $destinationfile

        # set the title
        sed -i "" "s/<% tp.file.title %>/$currentdate/g" $destinationfile
    fi
done
