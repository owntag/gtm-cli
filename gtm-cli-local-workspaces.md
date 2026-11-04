GTM CLI is working marvelously well so far, it's approaching 9000 downloads in total so far!
We now want to make it even better and that's where I need your help.

The next big feature shall be: local workspaces.

## The motivation

Things that are – sometimes – issues right now:

- Google's GTM API is not always super fast and therefore, lots of operation in sequence can take quite a while
- When users use owntag's public Google project rather than their own service key (which I suspect is most users) then it's reasonably likely that they'll get API rate limit errors because everyone shares the same per-project quota. While this probably doesn't happen often, I feel like it would be quite frustrating for any user even if it happens just once
- Even the best AI makes formatting errors sometimes. If we can catch those locally rather than having the API respond with an error, we're also faster. Local validation would be great.

## The parts

### Local workspace mechanism

The CLI has to offer a convenient way to manage these local workspaces.

Unlike through the API, any changes an agent makes will now basically apply instantaneously. Offer options to make these changes as easy as possible. Agents should be able to make edits without complex reasoning about the perfect JSON format. At least it's my feeling that the format that the non-workspace commands require is sometimes a bit unintuitive because it relies on the API-format a lot. But I might be wrong. Anyway - what I mean is that we can build the perfect format from scratch now for this feature and any AI agent will be able to create hundreds of commands and run them within a second so iteration could be much faster now.

Come up with a suggestion on your own on how to implement the command structure for the workspace logic.
Maybe it's gating everything behind a `gtm workspace …` command, but I am not sure – you certainly have more knowledge about what is established convention here than me.

### Local validation

Every change that an agent is trying to make should be validated locally and immediately.
For that to work, you'll obviously need some pretty deep knowledge about GTM's container structure yourself, I'd imagine.
The actual container format is hardly documented, if at all. So to allow you to build that knowledge on your own, you have access to these two Google Tag Manager containers:

Web: https://tagmanager.google.com/#/container/accounts/2596355618/containers/184391557/workspaces/17
SGTM: https://tagmanager.google.com/#/container/accounts/2596355618/containers/170912425/workspaces/20

There's nothing important in them and they're not in use anywhere and you're allowed to delete / create / edit stuff as you wish, you are even allowed to publish them. No others, though! Just these two.
I imagine it might be helpful for you to get a feel for the structure to then build the validator based on that knowledge. I don't know if the full container JSON export differs in any way from the format that API requests expect, but you'll find that out.
It's your job to come up with a viable solution for the representation of the current container status in the local workspace. But I imagine it would be wise to stay rather close to the real format that GTM expects eventually anyway.

I don't know how far an agent will / can get around writing larger JSON structures with the new workspaces feature. If it turns out it's not really practical, maybe it would be helpful to package jq with the CLI? Just an idea though.

### Documentation

It is vital that this new way of working is immediately understandable by both humans and agents alike.
Obviously, the project README is the most prominent place where this should be documented, even "advertised".
Make it easy to understand why this approach has benefits especially when working with agents.

## Example process for your reference

Here's what a typical usage process could look like

1) The user prompts their AI to do XYZ to one or several Google Tag Manager containers at once. Modifying several containers for the same change can be quite common, considering that many tag implementations span across Web + Server Side GTM containers and usually have to be worked on somewhat in parallel.

2) The AI uses the CLI to
- download the current container export as the full JSON
- Make edits, additions, etc. to on that JSON
- Every change is validated instantly and deterministically locally by the CLI. If the agent is doing anything wrong format-wise e. g. by supplying wrong parameter types, misconstructing some JSON or such, that should fail instantly with a helpful, actionable plain-english error message that an agent can act on and that even a human would profit from
- Push the complete changes to the actual remote GTM workspace
- The user will then usually manually review the change and publish the changes themselves through GTM's UI

## Miscellaneous requirements

1. Do not change / impact _any_ way that the CLI works right now. This project here must not introduce breaking changes. We know of several users who use GTM CLI as part of their CI / CD process deterministically and they must be able to trust that they're processes run exactly as they do now even if they update.

2. It must be easily possible at any time, both for humans and agents, to inspect the changes made on a local workspace compared to a) an unpublished remote workspace (if the local changes haven't been pushed yet) and b) compared to the actual live version of a container.
I suspect that it's useful to have two different display modes here – one for humans a one that's a little more information-dense and technical just for agents. 
Maybe even a local HTTP server that opens a page that shows the current progess in a GTM-like UI that is designed like the real deal so users will feel right at home? Sounds awesome tbh.