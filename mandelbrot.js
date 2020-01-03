const canvas = document.querySelector('canvas');
const width = canvas.width = window.innerWidth - 40;
const height = canvas.height = window.innerHeight - 40;
const display_ctx = canvas.getContext('2d');
const minaxis = Math.min(width, height);
display_ctx.font = "12px Arial";
display_ctx.strokeStyle = 'rgba(255, 255, 255, 255)';
let xoffset = -20;
let yoffset = -20;

let mouse = {x: 0, y: 0, r: 0, i: 0};
let draghome = {r: 0, i: 0};
let dragging = false;

// Minimum number of tiles along the shorter axis
const min_tiles = 8;

// Maximum width of a tile in pixels
const fixed_tile_size = Math.trunc(minaxis / min_tiles);

// Canvas used specially for scaling tiles for display
let prev_scalar;

// Local focus for mandelbrot set; Global focus for julia set
let c = {r: 0, i: 0};

// Center point of display
let center = {r: -0.5, i:0};

// Iteration variables
let z = {r: 0, i: 0};

let itr = 0;

// Zooming coefficient; smaller = closer
let zoom = 2;
let zoomlvl = 1;

// Maximum iteration count
let maxitr = 1024;
let bailout = 1 << 16;

// Display mode
let mode = 'mbrot';

// Whether to show the generation times of the tiles
let show_times = false;

// Collection of all currently rendered tiles
let tiles = new Map();
let times = new Map();

// Maximum number of new tiles generated per frame of rendering
let max_tiles_per_frame = 4;

// Modulo function
function mod(a, b) {return a - b * Math.trunc(a / b);}

function zzag(t) {return Math.min(mod(t, 2), 1) * -Math.sign(mod(t + 2, 4) - 2) + Math.max(Math.sign(mod(t + 2, 4) - 2), 0);}

// Returns the number of iterations after which a value either escapes to infinity or falls into an orbit
function mbrot_iter(zr, zi) {
    let cr = zr, ci = zi;

    let rsqr = zr * zr, isqr = zi * zi;
    let zsqr = (zr + zi) * (zr + zi);

    let q = rsqr + isqr - zr * 0.5 + 0.0625;

    if (q * (q + zr - 0.25) >= isqr * 0.25) {

        for (itr = 0; itr < maxitr; itr++) {
            zr = rsqr - isqr + cr;
            zi = zsqr - rsqr - isqr + ci;

            rsqr = zr * zr;
            isqr = zi * zi;
            zsqr = (zr + zi) * (zr + zi);

            if (rsqr + isqr > bailout) break;
        }

    } else {
        itr = maxitr;
    }

    // Correcting for continuous color
    if (itr < maxitr) itr -= Math.log(Math.log(rsqr + isqr) * 0.5 / Math.log(2)) / Math.log(2);
    return itr;
}

function julia_iter(zr, zi, cr, ci) {
    let rsqr = zr * zr, isqr = zi * zi;
    let zsqr = (zr + zi) * (zr + zi);

    for (itr = 0; itr < maxitr; itr++) {
        zr = rsqr - isqr + cr;
        zi = zsqr - rsqr - isqr + ci;

        rsqr = zr * zr;
        isqr = zi * zi;
        zsqr = (zr + zi) * (zr + zi);

        if (rsqr + isqr > bailout) break;
    }

    // Correcting for continuous color
    if (itr < maxitr) itr -= Math.log(Math.log(rsqr + isqr) * 0.5 / Math.log(2)) / Math.log(2);
    return itr;
}

function bship_iter(zr, zi) {
    let cr = zr, ci = zi;

    let rsqr = zr * zr, isqr = zi * zi;
    let zsqr = (zr + zi) * (zr + zi);

    for (itr = 0; itr < maxitr; itr++) {
        zr = Math.abs(rsqr - isqr + cr);
        zi = Math.abs(zsqr - rsqr - isqr + ci);

        rsqr = zr * zr;
        isqr = zi * zi;
        zsqr = (zr + zi) * (zr + zi);

        if (rsqr + isqr > bailout) break;
    }

    // Correcting for continuous color
    if (itr < maxitr) itr -= Math.log(Math.log(rsqr + isqr) * 0.5 / Math.log(2)) / Math.log(2);
    return itr;
}

function picko_iter(zr, zi) {
    let trapdist = 1000000;
    let cr = zr, ci = zi;

    let rsqr = zr * zr, isqr = zi * zi;
    let zsqr = (zr + zi) * (zr + zi);

    for (itr = 0; itr < maxitr; itr++) {
        zr = rsqr - isqr + cr;
        zi = zsqr - rsqr - isqr + ci;

        rsqr = zr * zr;
        isqr = zi * zi;
        zsqr = (zr + zi) * (zr + zi);

        trapdist = Math.min(Math.abs(zr), Math.abs(zi), trapdist);

        if (rsqr + isqr > bailout) break;
    }

    // For continuous color
    if (itr < maxitr) {
        let log_zn = Math.log(rsqr + isqr) * 0.5;
        let nu = Math.log(log_zn / Math.log(2)) / Math.log(2);
        itr += 1 - nu;
    }

    return trapdist * 100;
}

function stuff_iter(zr, zi) {
    let cr = zr, ci = zi;
    let tr;

    for (itr = 0; itr < maxitr; itr++) {
        tr = zr * cr + zr - zi * ci - zi + cr;
        zi = zr * ci + zr + zi * cr + zi + ci;
        zr = tr;

        if (zr * zr + zi * zi > bailout) break;
    }

    // Correcting for continuous color
    if (itr < maxitr) itr -= Math.log(Math.log(zr * zr + zi * zi) * 0.5 / Math.log(2)) / Math.log(2);
    return itr;
}

function makeTile(focus_real, focus_imag, tile_scale, mode) {
    let t0 = performance.now();

    let thistile = display_ctx.createImageData(fixed_tile_size, fixed_tile_size);
    thistileData = thistile.data;

    let data_offset;

    // Iterating through tile pixels on x axis
    for (let px = 0; px < fixed_tile_size; px++) {
        
        // Iterating through tile pixels on y axis
        for (let py = 0; py < fixed_tile_size; py++) {

            data_offset = (py * fixed_tile_size + px) * 4;
            
            // Converting pixel x to real component
            z.r = px / fixed_tile_size * tile_scale + focus_real - tile_scale / 2;

            // Converting pixel y to imaginary component
            z.i = py / fixed_tile_size * tile_scale + focus_imag - tile_scale / 2;

            // Iterating the appropriate function
            switch (mode) {
                case 'mbrot': itr = mbrot_iter(z.r, z.i); break; // Mandelbrot Set
    
                case 'julia': itr = julia_iter(z.r, z.i, c.r, c.i); break; // Julia Set
    
                case 'bship': itr = bship_iter(z.r, z.i); break; // Burning Ship Fractal

                case 'picko': itr = picko_iter(z.r, z.i); break; // Pickover Stalk coloring

                case 'stuff': itr = stuff_iter(z.r, z.i); break; // Random map
            }

            // Pixel is black if it didn't escape
            if (itr === maxitr) {
                thistileData[data_offset + 0] = 0; // Red
                thistileData[data_offset + 1] = 0; // Green
                thistileData[data_offset + 2] = 0; // Blue

            // If it did escape, color the pixel based on how long it took to do so
            } else {
                //itr -= Math.sqrt(z.rsqr + z.isqr) / 2;
                let theta = itr / 16;
                thistileData[data_offset + 0] = Math.trunc(1.00 * zzag(theta + 1) * 256); // Red
                thistileData[data_offset + 1] = Math.trunc(1.00 * zzag(theta + 1) * 256); // Green
                thistileData[data_offset + 2] = Math.trunc(1.00 * zzag(theta + 2) * 256); // Blue
            }

            thistileData[data_offset + 3] = 255; // Opacity
        }
    }

    return {tile:thistile, time:performance.now() - t0};
}


function loop() {

    // Clearing the display to prevent lingering frames
    display_ctx.fillStyle = 'rgba(0,0,0,255)';
    display_ctx.fillRect(0, 0, width, height);

    // Power of 2 which determines the area the tile covers in the complex plane
    let tile_scale = Math.pow(2, Math.trunc(Math.log2(zoom) - Math.log2(min_tiles)));

    let newtiles = 0;
    let stopgen = false;

    let gen_result;
    let currtile;
    let gen_time;

    let num_tiles = 0;
    let total_tiles = 0;

    // Number of tiles by which the center is offset
    let center_tile_x = Math.trunc(center.r / tile_scale);
    let center_tile_y = Math.trunc(center.i / tile_scale);
    
    // Number of pixels by which the center tile is offset
    let tile_offset_x = Math.trunc(mod(center.r / tile_scale, 1) * fixed_tile_size);
    let tile_offset_y = Math.trunc(mod(center.i / tile_scale, 1) * fixed_tile_size);

    let tile_x, tile_y, x_sign, y_sign, tile_real, tile_imag, tile_id, tile_draw_x, tile_draw_y;
    let t0;

    display_ctx.fillStyle = 'rgba(255,255,255,255)';

    // Iterating through the tiles of 1/4 of the screen
    for (tile_x = 0; tile_x - 2 < width / fixed_tile_size / 2; tile_x++) {
        for (tile_y = 0; tile_y - 2 < height / fixed_tile_size / 2; tile_y++) {

            // Flipping the signs of each tile coordinate to cover the remaining 3/4 of the screen
            for (x_sign = -1; x_sign <= 1; x_sign += 2) {
                for (y_sign = -1; y_sign <= 1; y_sign += 2) {
                    t0 = performance.now();
                    
                    // Creating a string which serves as a tile identifier
                    tile_id = `${mode}:(${tile_x * x_sign + center_tile_x},${tile_y * y_sign + center_tile_y})@${Math.log2(tile_scale)}x${maxitr}`;
                    
                    // Counting the total number of tiles 
                    total_tiles++;
                    
                    // Checking if the tile already exists
                    if (tiles.has(tile_id)) {
                        currtile = tiles.get(tile_id);
                        gen_time = times.get(tile_id);
                        
                        // If it doesn't exist, create a new one
                    } else if (!stopgen) {
                        
                        // Converting coordinates to complex pair
                        tile_real = (tile_x * x_sign + center_tile_x) * tile_scale;
                        tile_imag = (tile_y * y_sign + center_tile_y) * tile_scale;
                        
                        // Generating and saving the new tile and its generation time
                        gen_result = makeTile(tile_real, tile_imag, tile_scale, mode);
                        currtile = gen_result.tile;
                        gen_time = gen_result.time;
                        tiles.set(tile_id, currtile);
                        times.set(tile_id, gen_time);
                        newtiles++;
                        
                        // When the new tile limit is reached, don't generate another until the next frame
                        if (newtiles === max_tiles_per_frame) stopgen = true;

                    } else {
                        currtile = null;
                    }
                    
                    // If the current tile has been generated
                    if (currtile !== null) {

                        // The pixel positions at which the tile will be drawn
                        tile_draw_x = tile_x * x_sign * fixed_tile_size - tile_offset_x + (width - fixed_tile_size) / 2 + xoffset;
                        tile_draw_y = tile_y * y_sign * fixed_tile_size - tile_offset_y + (height - fixed_tile_size) / 2 + yoffset;

                        // Draw the tile onto the canvas
                        display_ctx.putImageData(currtile, tile_draw_x, tile_draw_y);

                        // Draw the generation time onto the canvas
                        if (show_times) {
                            display_ctx.fillText(performance.now() - t0 + 'ms', tile_draw_x, tile_draw_y+30);
                            display_ctx.fillText(gen_time + 'ms', tile_draw_x, tile_draw_y+15);
                        }

                        // Counting generated tiles
                        num_tiles++;
                    }
                }
            }
        }
    }

    // Marking the framerate as yellow while new tiles are being generated
    if (stopgen) {
        display_ctx.fillStyle = 'rgba(255,255,0,255)';
    } else {
        display_ctx.fillStyle = 'rgba(0,255,0,255)';
    }

    // Keeping track of time to calculate fps
    let newtime = new Date();

    // Writing certain information for the user
    let framedata = [
        `FPS: ${(1000 / (newtime - time)).toFixed(2)} (${Math.trunc(newtime - time)}ms)`,
        `cursor = ${(mouse.r + center.r).toFixed(-Math.trunc(zoomlvl / Math.log2(10)) + 3)} + ${(mouse.i + center.i).toFixed(-Math.trunc(zoomlvl / Math.log2(10)) + 3)}i`,
        `${Math.trunc(num_tiles / total_tiles * 100)}% Rendered`
    ]

    for (let lnum = 0; lnum < framedata.length; lnum++) {
        display_ctx.fillText(framedata[lnum], 5, 10 + lnum * 15);
    }

    time = newtime;
    window.requestAnimationFrame(loop);
}

// Pressing the left mouse button starts panning the display
document.onmousedown = function(ev) {
    if (ev.button === 0 && !dragging) {
        draghome = {r: mouse.r + center.r, i: mouse.i + center.i};
        dragging = true;
    }
}

// Tracking mouse position
document.onmousemove = function(event) {
    
    // Updating the mouse's position
    mouse = {
        
        // Pixel x and y coordinates
        x: event.clientX,
        y: event.clientY,
        
        // Real and imaginary components
        r: (event.clientX - width / 2) / minaxis * zoom,
        i: (event.clientY - height / 2) / minaxis * zoom
    };

    // Moving the center if the user is dragging the screen
    if (dragging) {
        center.r = (draghome.r - mouse.r);
        center.i = (draghome.i - mouse.i);
    }
}

// Releasing the left mouse button stops panning the display
document.onmouseup = function(event) {dragging = false;}

// Scrolling the mouse wheel zooms the display
document.onwheel = function(event) {

    // Scrolling forward zooms in
    if (event.deltaY < 0 && zoomlvl >= -41) {
        center.r += (mouse.r) / 2;
        center.i += (mouse.i) / 2;
        zoom /= 2;
        zoomlvl--;

    // Scrolling backward zooms out
    } else if (event.deltaY > 0 && zoomlvl <= 2) {
        center.r -= (mouse.r);
        center.i -= (mouse.i);
        zoom *= 2;
        zoomlvl++;
    }

    // Updating the mouse's position after zooming
    mouse = {
        
        // Pixel x and y coordinates
        x: event.clientX,
        y: event.clientY,
        
        // Real and imaginary components
        r: (event.clientX - width / 2) / minaxis * zoom,
        i: (event.clientY - height / 2) / minaxis * zoom
    };
}

// Tracking key controls
document.onkeydown = function(event) {

    // Switch display to Mandelbrot set mode
    if (event.key === "M" || event.key === "m") {mode = "mbrot";}

    // Switch display to Julia set mode
    if (event.key === "J" || event.key === "j") {mode = "julia";}

    // Switch display to Burning Ship set mode
    if (event.key === "B" || event.key === "b") {mode = "bship";}

    // Switch display to Pickover Stalk set mode
    if (event.key === "P" || event.key === "p") {mode = "picko";}

    // Switch display to Random map mode
    if (event.key === "S" || event.key === "s") {mode = "stuff";}

    // Return to default zoom 
    if (event.key === "Z" || event.key === "z") {center = {r: -0.5, i: 0}; zoom = 2; zoomlvl = 1;}

    // Showing the rendering times for the tiles
    if (event.key === "T" || event.key === "t") {show_times = !show_times;}

    // Toggling maximum iteration count
    if (event.key === "I" || event.key === "i") {maxitr = (maxitr < 1024) ? maxitr * 2 : 128;}

    // Change fixed point value for julia set
    if (event.key === "C" || event.key === "c") {
        let prev_c = {r:c.r, i:c.i};
        c = {r: mouse.r + center.r, i: mouse.i + center.i};

        // Only clearing the previously generated tiles when the focus changes
        if (c.r !== prev_c.r || c.i !== prev_c.i) {
            tiles.forEach((value, key) => {if (key.startsWith("julia")) tiles.delete(key);});
        }
    }
}

document.onkeyup = function(event) {

    // Change fixed point value for julia set
    if (event.key === "C" || event.key === "c") {
        c = {r: mouse.r + center.r, i: mouse.i + center.i};
    }
}

let time = new Date();
window.requestAnimationFrame(loop)

/*
Controls:
    M - Mandelbrot Set display mode
    J - Julia Set display mode
    B - Burning Ship Fractal display mode

    Z - Reset zoom
    C - Set new focus for julia set

    Left Click & Drag - Pan view
    Scroll Wheel - Zoom
*/
