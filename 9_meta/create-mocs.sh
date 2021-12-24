#!/bin/zsh

echo ""
echo ""
echo "This script creates files for all the linked MOC notes in all the meeting and task notes."
echo
echo "To identify an MOC, the script will search for linked notes which have one of the following prefixes: prs_ sys_ tpc_ ogu_"
echo "For each found MOC, the script will create a corresponding file using the pre-defined template."
echo "At the moment everything is configured in the script - if you want to change something, please adjust the script accordingly."

currentpath=`pwd`
destinationpath=$currentpath"/../7_mocs"
templatefile=$currentpath"/templates/moc.md"
currentdate=`date -j +"%Y-%m-%d"`

folderstosearch=("$currentpath/../3_meetings" "$currentpath/../4_tasks")

for folder in $folderstosearch
do
    echo
    echo "Processing $folder"
    echo
    foundmocs=(`grep -E -h -o "(\[\[)(sys_\S+?|ogu_\S+?|prs_\S+?|tpc_\S+?)(\]\])" $folder/* | sed "s/\[//g" | sed "s/\]//g"`)
    for foundmoc in $foundmocs
    do
        echo "    Found MOC: "$foundmoc
        destinationfile=$destinationpath"/"$foundmoc".md"
        echo "        resulting file: "$destinationfile

        if [[ -f $destinationfile ]]
        then
            echo "        file already exists --> skipping this MOC"
        else
            echo "        file does not exist --> creating a file for this MOC"
            cp $templatefile $destinationfile

            # set the created date
            sed -i "" "s/<% tp.date.now() %>/$currentdate/g" $destinationfile

            # set the title of the moc
            sed -i "" "s/<%\* tR \+= await this.app.workspace.getActiveFile().basename %>/$foundmoc/g" $destinationfile
        fi
    done
done
