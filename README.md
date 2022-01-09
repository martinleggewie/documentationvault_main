# documentationvault_main

An Obsidian vault to contain work-related information like tasks and minutes of meetings, enriched with templates and an opinionated way of managing and even sharing all the information between members of a team working together.

As Obsidian in its current version 0.13.19 is not really designed to contain information for more than one person, the structure of this main vault deliberately leaves some empty spaces. Each team member is supposed to fill in these empty spaces with own files and folders which she manages on her own.

To be concrete: Each team member should make nifty use of modern file systems, meaning that she is invited to symbolically link all the missing and additional files and folders to the correct locations. By using symbolic linking we can play Obsidian a trick and pretend that all the beloved files are there where Obsidian expects them to be.

A good example for such an empty space is the file "./obsidian/appearance". When Obsidian does not find this file in this location, it will silently create one. But typically a user would like to manage the appearance settings on her own. Each user would have different settings for the appearance. That means that we cannot store this file in the main vault. Instead, each user is supposed to symbolically link this file to the correct location "./obsidian/appearance". By using a symbolical link for this file Obsidian respects the settings in this file while each user can still store and manage these settings in a separate folder location.

Of course, this main vault and also all the user-specific extensions are supposed to be version controlled. Git repos come into mind here.

And if you think that this small README file does not really explain how all of this is supposed to work, then head over to <https://martinleggewie.github.io/documentationvault/>.
There I describe in more detail what you would need to configure and how to use this vault so that you could also use it for your own purposes.
