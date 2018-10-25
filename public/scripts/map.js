var map;
var data;
var markers = [];
var locations = [];
var map_labels = [];
var plot_common = false;
var overlay_is_visible = false;

var full_tracts_layer;
var partial_tracts_layer;
var municipal_layer;

// TODO: "Show" doesn't redraw tract/municipal boundaries

var prop_use_desc = [
    'Auto Sales','Bottler','Bowling Alley','Dept Store','Financial','Florist','Food Processing','Heavy Mfg','Insurance',
    'Motel','Municipal','Night Clubs','Nursing Home','Off Multistory','Office 1 Story','Open Storage',
    'Post Office','Prof Offices','Prv Hospital','Rest Drive-In','Restaurant','Retirement','Right-Of-Way',
    'Serv Stations','Service Shops','Sh Ctr Cmmity','Sh Ctr Nbhd','Sh Ctr Regional'
]; //'Multifamily', 'Condominium', 'Hospital','Misc. Residence','Mobile Home', 'Prv Schl/Coll','Pub Cty School',  'Sani/ Rest Home',

var restaurants = ['Rest Drive-In', 'Restaurant', 'Night Clubs'];

var default_empty_style = {
    fillColor: 'black',
    fillOpacity: 0,
    strokeWeight: 1
}

var default_hidden_style = {
    fillColor: 'black',
    fillOpacity: 0,
    strokeWeight: 0
}

var default_overlay_opacity = 0.15;
var default_font_size = 20;
var default_stroke_weight = 1;

function initMap() {

    var uf = {lat: 29.6436325, lng: -82.3571189};
    var cityCenter = {
        lat: 29.651961,
        lng: -82.325002
    }
    // var uf = {lat: 29.6209106, lng : -82.3795686};     //Butler Plaza

    // Fit to Gainesville
    var southwest = {lng: -82.4223898406203, lat: 29.5928305172926};
    var northeast = {lng: -82.2223916783364, lat: 29.7783563820721};
    var bounds = new google.maps.LatLngBounds(southwest, northeast);

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 13.5,
        center: cityCenter,
        styles: [
            {
              "featureType": "poi",
              "stylers": [
                {
                  "saturation": -100
                },
                {
                  "lightness": 25
                }
              ]
            },
            {
              "featureType": "poi.attraction",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.business",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.government",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.medical",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.park",
              "elementType": "geometry.fill",
              "stylers": [
                {
                  "saturation": -100
                },
                {
                  "lightness": 25
                },
                {
                  "weight": 1.5
                }
              ]
            },
            {
              "featureType": "poi.park",
              "elementType": "labels",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.place_of_worship",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            },
            {
              "featureType": "poi.sports_complex",
              "stylers": [
                {
                  "visibility": "off"
                }
              ]
            }
          ]
    });

    google.maps.event.addListenerOnce(map, 'idle', function() {
        map.fitBounds(bounds, 0);
        map.setZoom(12.5);
    });

    full_tracts_layer = new google.maps.Data({map: map});
    partial_tracts_layer = new google.maps.Data({map: map});
    municipal_layer = new google.maps.Data({map: map});

    loadFullTracts();
    loadPartialTracts();
    loadBoundaries();

    full_tracts_layer.setStyle({fillOpacity: 0, strokeWeight: 1});
    partial_tracts_layer.setStyle({fillOpacity: 0, strokeWeight: 1});
    municipal_layer.setStyle({fillOpacity: 0, strokeWeight: 5});

    // Get ready to draw regional dividers
    var dashes = [{
        icon: {
            path: 'M 0,-.5 0,.5',
            strokeOpacity: 0.75,
            scale: 2
        },
        offset: '0',
        repeat: '5px',
    }];

    // North-south divider
    var north_south_divider = new google.maps.Polyline({
        path: [
            {lat: northeast.lat + .1, lng: cityCenter.lng},
            {lat: southwest.lat - .1, lng: cityCenter.lng}
        ],
        strokeOpacity: 0,
        icons: dashes,
        map: map
    });

    // East-west divider
    var east_west_divider = new google.maps.Polyline({
        path: [
            {lat: cityCenter.lat, lng: northeast.lng + .1},
            {lat: cityCenter.lat, lng: southwest.lng - .1}
        ],
        strokeOpacity: 0,
        icons: dashes,
        map: map
    });

    console.log("active business data length: " + data.act_bus_data.length);
    console.log("acpafl data length: " + data.acpafl_data.length);
    console.log("permits data length: " + data.permits_data.length);

    //Finding locations with same co-ordinates
    var temp = intersection(data['act_bus_data'], data['permits_data']);
    locations = intersection(temp, data['acpafl_data']);
    var completePermitsData = data.completePermitsData;
    
    //Filtering out invalid permits
    locations.forEach(l=>{
        var key = l.latitude + l.longitude;
        var details = completePermitsData[key];
        var d1 = new Date(l.start_date);
        var count = 0;
        var permits = [];
        details.forEach(d=>{
            var d2 = new Date(d.issue_date);
            
            if(d1.getTime() <= d2.getTime()){
                count++;
                permits.push(d);
            }
        });
        l.num_permits = count;
        l["permits"] = permits;
    });
    locations.sort(sortFunction);

}

function sortFunction(a,b){
    if(a.num_permits == b.num_permits){
        if(a.business_type == b.business_type){
            return 0;
        }
        else{
            return a.business_type < b.business_type ? -1 : 1;
        }
    }
    else{
        return a.num_permits > b.num_permits ? -1 : 1;
    }
}

function intersection(list1, list2){

    var i = 0;
    var j = 0;
    var temp =[];
    while(i < list1.length && j < list2.length){
        
        if(list1[i].latitude < list2[j].latitude){
            i++;
        }
        else if(list1[i].latitude > list2[j].latitude){
            j++;
        }
        else{

            if(list1[i].longitude < list2[j].longitude){
                i++;
            }
            else if(list1[i].longitude > list2[j].longitude){
                j++;
            }
            else{
                if(list1[i].latitude){
                    if(list2[j].hasOwnProperty('prop_use_desc')){
                        list1[i]['prop_use_desc'] = list2[j]['prop_use_desc'];
                    }
                    else{
                        list1[i]['num_permits'] = list2[j]['num_permits'];
                        list1[i]['primary_party'] = list2[j]['name'];
                    }                                        
                    temp.push(list1[i]);
                }
                i++;
                j++;
            }
        }
    }
    return temp;
}

function displayMarkers(){
    var dataset = document.getElementById("dataset").value;
    var direction = document.getElementById("direction").value;
    console.log(dataset, " " , direction);

    var infos = data[dataset];
    var temp = dataset + '_icon';
    infos.forEach(function(info, i, array) {

        var addr = info.address;
        var parts = addr.split(' ');
        var iconName = dataset + '_icon';
        var content = "Name: " + info.name + '<br>' + "Addr: " + info.address;        
        content = dataset === "acpafl_data" ?  content + '<br>' + "Prop_Use: " + info.prop_use_desc : content;
        content = dataset === "permits_data" ? content + "<br>" + "#Permits: " + info.num_permits : content;
        //console.log(parts);
        if(parts.length > 1 && parts[1] === direction){
            if(dataset === "permits_data" || dataset === "act_bus_data" || (dataset === "acpafl_data" && prop_use_desc.includes(info.prop_use_desc))){
                //console.log({lat : parseFloat(info.latitude), lng : parseFloat(info.longitude)});
                var loc = {lat : parseFloat(info.latitude), lng : parseFloat(info.longitude)};
                var str = info.latitude+info.longitude;
                if(plot_common){
                    
                    loc = locations.hasOwnProperty(str) ? loc : {lat: 0, lng: 0};
                    var tokens = locations.hasOwnProperty(str) ? locations[str].split('\n') : [];
                    var markerInfo = "";
                    if(tokens.length > 0){
                        markerInfo += "Name: " + tokens[0] + "<br>" + "Addr: " + tokens[1] + "<br>" + 
                                        "Business Type: " + tokens[2] + "<br>" + "#permits: " + tokens[3] 
                                        + "<br>" + "Property Use: " + tokens[4];
                    }
                    content = locations.hasOwnProperty(str) ? markerInfo : content;
                }
                var marker = new google.maps.Marker({
                    position: loc,
                    map : map,
                    icon: data[iconName],
                    data : new google.maps.InfoWindow({
                        content: content
                    })
                });

                marker.addListener('mouseover', ()=>{
                    marker.data.open(map,marker);
                });

                marker.addListener('mouseout', ()=>{
                    marker.data.close();
                });

                markers.push(marker);
            }

        }

    });
}

function clearPage(){

    //document.getElementById("right-panel").style.display = "none";
    markers.forEach(marker=>{
        marker.setMap(null);
    });
    markers.length = 0;
	
    
}

function plotCommon(){

    var count =  0;
    var business_type = document.getElementById("business_type").value;
    console.log("business_type: "+business_type);
    var filedata = [];
    locations.some(l=>{
        var markerInfo;
        // if(restaurants.includes(l.prop_use_desc)){ 
        if(l.business_type === business_type){
            count++;
            filedata.push(l);
            var lat = parseFloat(l.latitude);
            var lng = parseFloat(l.longitude);
            markerInfo = "Name: " + l.name + "<br>" + "Addr: " + l.address + "<br>" + 
                                "Business Type: " + l.business_type + "<br>" + "#permits: " + l.num_permits
                                + "<br>" + "Primary party: " + l.primary_party + "<br>" + "Running since :" + l.start_date;

            var marker = new google.maps.Marker({
                position: {lat: lat, lng: lng},
                map : map,
                icon: '../images/business.png',
                data : new google.maps.InfoWindow({
                    content: markerInfo
                })
            });

            marker.addListener('mouseover', ()=>{
                marker.data.open(map,marker);
            });

            marker.addListener('mouseout', ()=>{
                marker.data.close();
            });

            marker.addListener('click', ()=>{

                var form = document.createElement("form");
                    form.setAttribute("action", "/data");
                    form.setAttribute("METHOD", "POST");
                    form.setAttribute("target", "_blank");

                    var ipField1 = document.createElement("input");
                        ipField1.setAttribute("type", "hidden");
                        ipField1.setAttribute("name", "data[info]");
                        ipField1.setAttribute("value", JSON.stringify(l));
                    var ipField2 = document.createElement("input");
                        ipField2.setAttribute("type", "hidden");
                        ipField2.setAttribute("name", "data[filedata]");
                        ipField2.setAttribute("value", JSON.stringify(filedata));
                    console.log(filedata);
                    form.appendChild(ipField1);
                    form.appendChild(ipField2);
                    document.body.appendChild(form);
                form.submit();

            });

            markers.push(marker);
        }
        return count === 20;

    });
}


function showTractIDsOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = default_overlay_opacity;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Colorize
            feature_color = 'gray';
            feature_opacity = default_overlay_opacity;

            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            var map_label = new MapLabel({
                text: tract.name,
                position: center,
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showSuccessOverlay(feature) {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = 0.5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }
            
            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);
            //center.lat += -.01;

            // Ignore empty tracts
            if (tract.success_responses == 0) {
                addNALabel(center);

                return default_empty_style;
            }

            // Smear values from 0.60 to 0.90
            var rate = tract.success_rate //Math.min(1, (tract.success_rate - .60)*(100/30));

            // Colorize
            feature_color = 'hsl(' + 30*Math.max(Math.floor(10*rate - 6), 0) + ', 100%, 50%)';
            feature_opacity = default_overlay_opacity;

            var map_label = new MapLabel({
                text: /*tract.name + '\n' + */Math.round(tract.success_rate*100) + "%",//\n(" + tract.success_responses + ")"
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showSurveyedOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = .5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }

            // Colorize
            feature_opacity = (tract.success_responses == 0) ?
                default_overlay_opacity + .1 :
                default_overlay_opacity;

            acceptable_rate = .2;
            //land = feature.getProperty('ALAND')/10000000;
            blend = Math.min(acceptable_rate, tract.success_responses/tract.total_businesses)/acceptable_rate;
            feature_color = 'hsl(' + 120*(blend) + ', 100%, 50%)'; // Red to green
            // feature_color = 'hsl(120, 100%, ' + Math.floor(blend*50) + '%)'; // Green to gray
            
            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            var map_label = new MapLabel({
                text: tract.success_responses.toString(),
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }
        else
            map.data.remove(feature);

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showActiveBusinessesOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = .5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }
            
            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            // Ignore empty tracts
            if (tract.total_businesses == 0) {
                addNALabel(center);
                
                return default_empty_style;
            }

            // Colorize
            max = 1000;
            land = feature.getProperty('ALAND')/10000000;
            blend = Math.min(max, tract.total_businesses/land)/max;
            feature_color = 'hsl(' + 120*(blend) + ', 100%, 50%)';
            feature_opacity = default_overlay_opacity;

            var map_label = new MapLabel({
                text: tract.total_businesses.toString(),
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }
        else
            map.data.remove(feature);

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showPopulationOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = .5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }
            
            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            // Ignore empty tracts
            if (tract.population == 0) {
                addNALabel(center);
                
                return default_empty_style;
            }

            // Colorize
            max = 15000;
            land = feature.getProperty('ALAND')/10000000;
            blend = Math.min(max, tract.population/land)/max;
            feature_color = 'hsl(' + 120*blend + ', 100%, 50%)';
            feature_opacity = default_overlay_opacity;

            var map_label = new MapLabel({
                text: tract.population.toString(),
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }
        else
            map.data.remove(feature);

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showActiveBusinessesVsPopulationOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = .5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }
            
            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            // Ignore empty tracts
            if (tract.population == 0 || tract.total_businesses == 0) {
                addNALabel(center);
                
                return default_empty_style;
            }

            // Colorize
            max = 100;
            land = feature.getProperty('ALAND')/10000000;
            blend = Math.min(max, tract.population/tract.total_businesses)/max;
            feature_color = 'hsl(' + 120*(blend) + ', 100%, 50%)';
            feature_opacity = default_overlay_opacity;

            var map_label = new MapLabel({
                text: (tract.population/tract.total_businesses).toFixed(0).toString(),
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });

            map_labels.push(map_label);
        }
        else
            map.data.remove(feature);

        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function showPopulationPerBusinessVsSuccessOverlay() {
    tract_data = data.tract_data;
    partial_tracts_layer.setStyle(function(feature) {
        var tract_geoid = feature.getProperty('GEOID');

        var feature_color = 'black';
        var feature_opacity = .5;

        if (feature.getProperty('COUNTYFP') == '001') {
            // Find tract data
            var tract = tract_data.find(function(tract) {
                return (tract.geoid == tract_geoid);
            });

            // Set fill color
            if (tract === undefined) {
                return default_empty_style;
            }

            // Add text
            var geo = feature.getGeometry();
            var center = getGeometryCentroid(geo);

            // Ignore empty tracts
            if (tract.population == 0 || tract.total_businesses == 0 || tract.success_responses == 0) {
                addNALabel(center);
                
                return default_empty_style;
            }

            // Colorize
            max = 100;
            var rate = Math.min(1, (tract.success_rate - .60)*(100/30));
            blend = rate * Math.min(max, tract.population/tract.total_businesses)/max;
            //feature_color = 'hsl(' + (blend*180) + ', 100%, 50%)';
            feature_color = 'hsl(' + (315 - blend*135) + ', 100%, 50%)'; // 315 - 180 = 135
            feature_opacity = default_overlay_opacity;

            var map_label = new MapLabel({
                text: (tract.population/tract.total_businesses).toFixed(0) + " - " + Math.round(100*tract.success_rate) + "%",
                position: center,//bounds.getCenter(),
                map: map,
                fontSize: default_font_size,
                align: 'center'
            });
            map_labels.push(map_label);
        }
    
        return {
            fillColor: feature_color,
            fillOpacity: feature_opacity,
            strokeWeight: default_stroke_weight
        };
    });
}


function addNALabel(position) {

    var map_label = new MapLabel({
        text: "N/A",
        position: position,//bounds.getCenter(),
        map: map,
        fontSize: default_font_size,
        align: 'center'
    });
    map_labels.push(map_label);
}

function hideOverlay() {
    clearLabels();

    full_tracts_layer.setStyle(function(feature) {
        return default_hidden_style;
    });

    partial_tracts_layer.setStyle(function(feature) {
        return default_hidden_style;
    });

    municipal_layer.setStyle(function(feature) {
        return default_hidden_style;
    });
}

function clearLabels() {
    for (var i = 0; i < map_labels.length; ++i) {
        map_labels[i].setMap(null);
    }

    map_labels = []
}

function getGeometryCentroid(geo) {

    /*var bounds = new google.maps.LatLngBounds();
    var lat = 0;
    var lng = 0;
    var n = 0;
    geo.forEachLatLng(function(LatLng) {
        bounds.extend(LatLng);
        lat += LatLng.lat();
        lng += LatLng.lng();
        ++n;
    }, this);
    lat /= n;
    lng /= n;*/

    var points = geo.getArray();
    var prev_point;
    var lat = 0;
    var lng = 0;
    var n = 0;
    var total_length = 0;
    geo.forEachLatLng(function(LatLng) {
        if (n > 0) {
            var delta_lat = LatLng.lat() - prev_point.lat();
            var delta_lng = LatLng.lng() - prev_point.lng();
            var seg_length = Math.sqrt(
                Math.pow(delta_lat, 2) +
                Math.pow(delta_lng, 2)
            );
            lat += (prev_point.lat() + delta_lat/2)*seg_length;
            lng += (prev_point.lng() + delta_lng/2)*seg_length;
            total_length += seg_length;
        }

        prev_point = LatLng;
        ++n;
    }, this);

    lat /= total_length; //= 29.644862;
    lng /= total_length; //= -82.339189;
    return new google.maps.LatLng(lat, lng);
}


function loadFullTracts() {
    full_tracts_layer.loadGeoJson('../geometries/census_tract_geometries.json', null, function(features) {
        features.forEach(function(feature) {
            if (feature.getProperty('COUNTYFP') != '001')
                full_tracts_layer.remove(feature);
        });
    });
}


function loadPartialTracts() {
    partial_tracts_layer.loadGeoJson('../geometries/clipped_tract_geometries.geojson');
}


function loadBoundaries() {
    municipal_layer.loadGeoJson('../geometries/MunicipalBoundary.geojson', null, function(features) {
        features.forEach(function(feature) {
            if (feature.getProperty('Name') != 'GAINESVILLE')
                municipal_layer.remove(feature);
        });
    });
}


function showOverlay() {
    var overlay_style = document.getElementById("overlay_style").value;
    console.log("Overlay style: " + overlay_style);

    if (!overlay_is_visible) {
        overlay_is_visible = true;
    }

    /*municipal_features.forEach(function(feature) {
        map.data.remove(feature);
    }, this);*/

    clearLabels();

    switch (overlay_style) {
    case "TRACT IDS":
        return showTractIDsOverlay();
    case "SUCCESS":
        return showSuccessOverlay();
    case "SURVEYED":
        return showSurveyedOverlay();
    case "ACTIVE BUSINESSES":
        return showActiveBusinessesOverlay();
    case "POPULATION":
        return showPopulationOverlay();
    case "ACTIVE BUSINESSES VS POPULATION":
        return showActiveBusinessesVsPopulationOverlay();
    case "POPULATION PER BUSINESS VS SUCCESS":
        return showPopulationPerBusinessVsSuccessOverlay();
    }
}

// Business Markers
document.getElementById("submitButton").addEventListener("click", displayMarkers);
document.getElementById("clear_button").addEventListener("click", clearPage);
document.getElementById("plot_common").addEventListener("click", plotCommon);

// Overlay
document.getElementById("show_overlay_button").addEventListener("click", showOverlay);
document.getElementById("hide_overlay_button").addEventListener("click", hideOverlay);
