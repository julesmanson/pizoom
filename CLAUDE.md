PiZoom 0.1.0 beta

1. recall button should behave like this:
recall + save -:> applies saved zoom but if there is only one save button recall applies it alone
save (alone) -> saves and overwrites whateve was saved by that button.

2. in config or wherever we place custom settings allow to set app  up to 3 save buttons.
anything out of range {1, 2, 3} fallsback to 0 this means no recall button is placed.3. 

3. we need 3 class sizes of buttons for small medium large with 3 keys for the 3 sizes.  the first true it sees is the size it will apply. fallsback to default medium for wrong type (ie number, objects, key missing or even if entire json file is missing etc)

the+/-keys will be very short but all other buttons be same size within their class

small is only smaller than medium and large is only slightly larger.
4. we need a settable zoom increments with a default value for wrong type or key missing. 
5. place all default fallbacks in an object at top of the pizoom javascript file.
6. the spirit of it is to prevent all errors. i dont want to see any errors. but im fine with it producing a warning only on first use after any button is pressed, once per vscode session:
it should list every key with A bad entry with what is wrong with it and what pizoom expected

 6. give it 4 options (topleft, topright, bottomleft, bottomright) in 4 keys for placing pizoom. the first true it sees is the target. if there is no space its placed on the opposite side of same br with an alert on why it was placed there.if it still there js no space it tries the other left first. make bottom left defaulf fallback. i dont want to displace any existing or native items if i can avoid it. when i point to any of the 4 corners i mean toward the center where there might some open real estate.




 