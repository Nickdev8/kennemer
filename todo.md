codex resume 019eb0de-650d-7e42-b2fb-8691df88dca7

ssh -f -N kennemer-http


move the app/src/lib/config/devices.ts and app/src/lib/config/advanced.ts to a more locigal and root location for quicker editing

update cli not working


allow for group: 'Group', to turn on and off a group instead of a scene. currently i get the error "could not find the target scene"

when statusdeviceid is set, make the button apear on and off based on the state of that device, its a device that is in the group/scene that we are enable/disableing so is a good indicator if it went through, always. and keep pulling at the same rate as the refresh button. and when we press the card/button refresh that button fast and slower over time untill we sync back with the refresh of the rest of the devices

the screen goes dark after a bit of time, aka sleep. change that to not happen on the screen side, and add instead of fully black to it being always on and only darkening svelte webapp side