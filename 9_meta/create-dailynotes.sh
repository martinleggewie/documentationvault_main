#!/bin/zsh

echo ""
echo "This script creates dailynotes for a given time range."
echo "At the moment everything is configured in the script - if you want to change something, please adjust the script accordingly."
echo ""

currentpath=`pwd`
destinationpath=$currentpath"/../2_dailynotes"
templatefile=$currentpath"/templates/dailynote.md"

startdate="2021-01-01"
amountofdays="50"

echo "Start date:   $startdate"
echo "End date:     $enddate"
echo "Current path: $currentpath"
echo

for i in {0..$amountofdays}
do
    currentdate=`date -j -v +$i"d" -f "%Y-%m-%d" +"%Y-%m-%d" $startdate`
    currentdayofweek=`date -j -v +$i"d" -f "%Y-%m-%d" +"%a" $startdate`
    echo $currentdate - $currentdayofweek

    if [[ $currentdayofweek == "Sat" || $currentdayofweek == "Sun" ]]
    then
        continue
    fi

    destinationfile=$destinationpath"/"$currentdate".md"
    cp $templatefile $destinationfile

    sed -i "" "s/<% tp.file.title %>/$currentdate/g" $destinationfile
done
