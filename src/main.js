/**
 * Get access to the Spotfire Mod API by providing a callback to the initialize method.
 * @param {Spotfire.Mod} mod - mod api
 */
Spotfire.initialize(async (mod) => {

	/// hello world!
    /**
     * Create the read function.
     */
    const reader = mod.createReader(
		mod.visualization.data(), 
		mod.windowSize(),
		mod.visualization.axis("X"),
		mod.visualization.axis("Y")
	);

    /**
     * Store the context.
     */
    const context = mod.getRenderContext();

    /**
     * Initiate the read loop
     */
    reader.subscribe(render);

    /**
     * @param {Spotfire.DataView} dataView
     * @param {Spotfire.Size} windowSize
     * @param {Spotfire.ModProperty<string>} prop
     */
    async function render(dataView, windowSize, xAxis, yAxis) {
	
        /**
         * Check the data view for errors
         */
        let errors = await dataView.getErrors();
        if (errors.length > 0) {
            // Showing an error overlay will hide the mod iframe.
            // Clear the mod content here to avoid flickering effect of
            // an old configuration when next valid data view is received.
            mod.controls.errorOverlay.show(errors);
            return;
        }
        mod.controls.errorOverlay.hide();


        /**
         * Get rows from dataView
         */
        const rows = await dataView.allRows();
        if (rows == null) {
            // User interaction caused the data view to expire.
            // Don't clear the mod content here to avoid flickering.
            return;
        }


		/**
		 * Clear SVG 
		 */	
		var svgmod = document.querySelector("#mod-svg");
		svgmod.setAttribute("width", windowSize.width);
		svgmod.setAttribute("height", windowSize.height);
		svgmod.querySelectorAll("g").forEach(function(g){ g.innerHTML = "";});
		svgmod.onclick = function (e) {
            if (e.target === svgmod) {
                dataView.clearMarking();
            }
        };
		
		
		/**
		 * Create data structure for bars
		 */
		var cataxis = await dataView.categoricalAxis("X");
		var cataxislevels = cataxis.hierarchy.levels;
		
		var bars = new Array();
		
		cataxislevels.forEach(function(level, i){
			
			var bar = { name: level.name, totalvalue: 0, barsegments: new Array() };
			
			rows.forEach(function(row, j){
				
				var rowvalue = Number(row.continuous("Y").value());
				var rowlabel = row.categorical("X").value();
				var rowlabelpart = rowlabel[i].formattedValue();
				var rowlabelpartkey = rowlabel[i].key;
				
				var barsegment = bar.barsegments.find( obj => { return obj.labelkey === rowlabelpartkey });
				
				if (typeof barsegment === 'undefined'){
					barsegment = { label: rowlabelpart, labelkey: rowlabelpartkey, value: 0, rows: new Array() }; 
					bar.barsegments.push( barsegment );
				}
				
				var rowlabelpartarray = new Array();
				rowlabel.forEach(function(rowlabelpart){
					rowlabelpartarray.push(rowlabelpart.key);	
				});
				barsegment.rows.push( { rowid: j, rowvalue: rowvalue, label: rowlabelpartarray, labellevel: i } );
				barsegment.value += rowvalue;
				
				bar.totalvalue += rowvalue;
	
			});			
			bars.push(bar);			
		});

		//TODO Check for negative bar values and show error
		//TODO Check if sum of all barvalues is the same for all bars


		/**
		 * Define constansts
		 */
		const barwidth = 15;
		const svgpadding = 5;
		const bargap = (windowSize.width - svgpadding - barwidth * (bars.length) ) / (bars.length - 1);

		//TODO barsegmentgap should be look at max number of barsegments to ensure certain minimum space between segments 
		const barsegmentgap = windowSize.height * 0.1;
		const heightscale = (windowSize.height - barsegmentgap - 2 * svgpadding) / bars[0].totalvalue;

		const barsegmentlabelgap = 3;
		

		/**
		 * Sort bars and barsegments
		 */
		bars.forEach(function(bar, i){
			bar.barsegments.sort((a, b) => a.label.localeCompare( b.label ) );						

			bar.barsegments.forEach(function(barsegment, j){
				barsegment.rows.sort((a, b) => 
					{
						var k = a.labellevel;
						if (k > 0){
							return a.label[k-1].localeCompare( b.label[k-1] ); 
						}
						if (k < a.label.length - 1 ){
							return a.label[k+1].localeCompare( b.label[k+1] );
						}
						else return 0;
					}
				);
			});
		});

	
		/**
		 * Calculate coordinates
		 */
		bars.forEach(function(bar, i){
			
			var barheightcursor = svgpadding;
			
			bar.barsegments.forEach(function(barsegment, j){

				barsegment.x = svgpadding + bargap * i + barwidth * i;
				barsegment.y = barheightcursor;

				barsegment.rows.forEach(function(barsegmentrow, k){

					barsegmentrow.y = barheightcursor;
					barheightcursor += barsegmentrow.rowvalue * heightscale;
					
				});

				barheightcursor += barsegmentgap / (bar.barsegments.length - 1);

			});
		});

		
		/**
		 * Render bars
		 */
		bars.forEach(function(bar, i){
			
			bar.barsegments.forEach(function(barsegment, j){
								
				/**
				 * Render rect
				 */
				var rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
				rect.setAttribute("x", barsegment.x);
				rect.setAttribute("y", barsegment.y);
				rect.setAttribute("width", barwidth);
				rect.setAttribute("height", barsegment.value * heightscale);
				rect.setAttribute("style", "fill: darkgrey;");
				rect.setAttribute("bar", i);
				rect.setAttribute("barsegment", j);
				document.querySelector("#mod-svg-bars").appendChild(rect);

				
				/** 
				 * Tool Tip
				 */
				rect.onmouseover = function (event){
					var barid = event.target.getAttribute("bar");
					var barsegmentid = event.target.getAttribute("barsegment");
					var barsegment = bars[barid].barsegments[barsegmentid];
					
					var tooltip = yAxis.parts[0].displayName + ": " + barsegment.value + "\r\n" +
						xAxis.parts[barid].displayName + ": " + barsegment.label;
					
                    mod.controls.tooltip.show(tooltip);
				};
				rect.onmouseout = function (event){
                    mod.controls.tooltip.hide();
				}
				
				
				/** 
				 * Marking
				 */
				rect.onclick = function ( event ){
					var barid = event.target.getAttribute("bar");
					var barsegmentid = event.target.getAttribute("barsegment");
					var barsegment = bars[barid].barsegments[barsegmentid];

					var markrows = new Array();
					barsegment.rows.forEach(function(barsegmentrow, k){
						markrows.push(rows[barsegmentrow.rowid]);
					});

					if (event.shiftKey) {
						dataView.mark(markrows,"Add");
					}
					else {
						dataView.mark(markrows,"Replace");
					}
				};


				/**
				 * Render label
				 */
				var text = document.createElementNS("http://www.w3.org/2000/svg","text");
				if ( i == bars.length - 1 ) {
					text.setAttribute("x", barsegment.x - barsegmentlabelgap);
					text.setAttribute("text-anchor", "end");
				}				
				else {
					text.setAttribute("x", barsegment.x + barwidth + barsegmentlabelgap);
					text.setAttribute("text-anchor", "start");
				}
				if ( bars[i].barsegments.length == 1 || j < bars[i].barsegments.length - 1 ){
					text.setAttribute("baseline-shift", "-1em");
					text.setAttribute("y", barsegment.y);
				}
				else {
					text.setAttribute("baseline-shift", "0.2em");
					text.setAttribute("y", windowSize.height - svgpadding);					
				}
				text.innerHTML = barsegment.label;
				document.querySelector("#mod-svg-labels").appendChild(text);
				if ( text.getBBox().height > barsegment.value * heightscale + barsegmentgap / (bars[i].barsegments.length - 1) ){
					text.setAttribute("visibility", "hidden");
				}

			});
		});

				
		/**
		 * Render rows
		 */	
		rows.forEach(function(row, j){
			
			var rowvalue = Number(row.continuous("Y").value());
			var rowlabel = row.categorical("X").value();
			var rowcolor = row.color().hexCode;
			
			for(var i = 0; i < rowlabel.length; i++){
				
				var bar1 = bars[i];
				var barsegment1 = bar1.barsegments.find( obj => { return obj.label === rowlabel[i].formattedValue() });
				var barsegmentrow1 = barsegment1.rows.find( obj => { return obj.rowid === j });

				if ( i + 1 < rowlabel.length ){

					var bar2 = bars[i + 1];
					var barsegment2 = bar2.barsegments.find( obj => { return obj.label === rowlabel[i + 1].formattedValue() });
					var barsegmentrow2 = barsegment2.rows.find( obj => { return obj.rowid === j });

					var path = document.createElementNS("http://www.w3.org/2000/svg","path");
					path.setAttribute("d", [
						"M", barsegment1.x + barwidth, barsegmentrow1.y,
						"C", barsegment1.x + barwidth + bargap / 4, barsegmentrow1.y,
						barsegment2.x - bargap / 4, barsegmentrow2.y,
						barsegment2.x, barsegmentrow2.y,
						"L", barsegment2.x, barsegmentrow2.y + rowvalue * heightscale, 
						"C", barsegment2.x - bargap / 4, barsegmentrow2.y + rowvalue * heightscale, 
						barsegment1.x + barwidth + bargap / 4, barsegmentrow1.y + rowvalue * heightscale,
						barsegment1.x + barwidth, barsegmentrow1.y + rowvalue * heightscale,
						"Z"
					].join(" "));
					path.setAttribute("style", "fill:" + rowcolor + ";");
					path.setAttribute("row", j);
					path.setAttribute("rowvalue", rowvalue); 
					path.setAttribute("marked", row.isMarked());
					document.querySelector("#mod-svg-rows").append(path);
					
					
					/** 
					 * Outline
					 */
					var outlinewhitepath = document.createElementNS("http://www.w3.org/2000/svg","path");
					outlinewhitepath.setAttribute("d", [
						"M", barsegment1.x + barwidth -2, barsegmentrow1.y -2,
						"C", barsegment1.x + barwidth + bargap / 4, barsegmentrow1.y -2,
						barsegment2.x - bargap / 4, barsegmentrow2.y -2,
						barsegment2.x +2, barsegmentrow2.y -2,
						"L", barsegment2.x +2, barsegmentrow2.y + rowvalue * heightscale +2, 
						"C", barsegment2.x - bargap / 4, barsegmentrow2.y + rowvalue * heightscale +2, 
						barsegment1.x + barwidth + bargap / 4, barsegmentrow1.y + rowvalue * heightscale +2,
						barsegment1.x + barwidth -2, barsegmentrow1.y + rowvalue * heightscale +2,
						"Z"
					].join(" "));
					var fontColor = mod.getRenderContext().styling.general.font.color;
					outlinewhitepath.setAttribute("style", "stroke: " + fontColor + "; stroke-width: 1px; fill:none;");
					outlinewhitepath.setAttribute("row", j);
					outlinewhitepath.setAttribute("visibility", "hidden");
					document.querySelector("#mod-svg-rows-outlines").append(outlinewhitepath);
					
					
				
					/** 
					 * Marking
					 */
					path.onclick = function ( event ){
						var row = rows[event.target.getAttribute("row")];
						if (event.shiftKey) {
							dataView.mark(new Array(row),"Add");
						}
						else {
							dataView.mark(new Array(row),"Replace");
						}
					};
					
					/** 
					 * Tool Tip and Trigger Outline
					 */
					path.onmouseover = function (event){
						var j = event.target.getAttribute("row");
  						timeOut = setTimeout(() => {
							outlinepaths = document.querySelectorAll("#mod-svg-rows-outlines > path[row='"+j+"']");
							outlinepaths.forEach(function(outlinepath){
								outlinepath.setAttribute("visibility", "visible");
							});
  						}, 600);

						var row = rows[j];

						var yFormattedValue = row.continuous("Y").formattedValue();
						var tooltip = yAxis.parts[0].displayName + ": " + yFormattedValue + "\r\n";
						
						var xValue = row.categorical("X").value();
						for(var i = 0; i < xValue.length; i++){
							tooltip += xAxis.parts[i].displayName + ": " + xValue[i].formattedValue() + "\r\n";
						}
						
	                    mod.controls.tooltip.show(tooltip);

					};
					path.onmouseout = function (event){
						var j = event.target.getAttribute("row");
						clearTimeout(timeOut);
						
						outlinepaths = document.querySelectorAll("#mod-svg-rows-outlines > path[row='"+j+"']");
						outlinepaths.forEach(function(outlinepath){
							outlinepath.setAttribute("visibility", "hidden");
						});

	                    mod.controls.tooltip.hide();
					}
					
				}

			}

		});
		
		
        /**
         * Sorting of rows so that small rows are in front of big rows
         */
		paths = Array.from(document.querySelector("#mod-svg-rows").children);
		paths.sort(function(a, b) {
			avalue = Number(a.getAttribute("rowvalue"));
			bvalue = Number(b.getAttribute("rowvalue"));
  			return bvalue - avalue;
		});
		paths.forEach(function(path){
			if ( path.getAttribute("marked") == "true" ){
				document.querySelector("#mod-svg-rows-marked").appendChild(path);						
			} else {
				document.querySelector("#mod-svg-rows").appendChild(path);
			}
		});
		
			
        /**
         * Signal that the mod is ready for export.
         */
        context.signalRenderComplete();
    }
});
