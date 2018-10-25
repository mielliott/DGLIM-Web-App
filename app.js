"use strict"
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const mysql = require('mysql');
const async = require('async');
const moment = require('moment');
const color = require('color');

var dbConn;
var completeData = {}; // What is this for? Why not just use "data"?
var app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));

app.get("/", function(req, res){

    var active_business_data = [];
    var acpafl_data = [];
    var permits = [];
    var tract_data = [];

    new Promise((resolve, reject)=> {

        dbConn = mysql.createConnection({
            host : 'localhost',
            user : 'root',
            database : 'DGLIM_Data'
        });
        dbConn.connect(err=>{
            if(err){
                console.log("Error connecting to database");
                reject(err);
            }
            else{
                var q = "SELECT * FROM acpafl_geocoded";
                dbConn.query(q, [], (error, results, fields)=>{
                    if(error){
                        console.error("Error fetching data");
                        reject(error);
                    }
                    else{
                        console.log("Fetched acpafl data");
                        resolve(results);
                    }
                });
            }
        });

    }).then((data)=>{

        return new Promise((resolve, reject)=>{
            async.each(data, (datum, next)=>{

                var info = { name: datum.Owner_name, address: datum.Address, prop_use_desc: datum.Prop_Use_Desc, latitude : datum.Latitude, longitude : datum.Longitude};
                acpafl_data.push(info);
                next();
            },
            error=>{
                if(error) {
                    console.log("Error while processing acpafl data");
                    reject(error);
                }
                else{
                    console.log("Processed acpafl data");
                    acpafl_data.sort(sortFunction);
                    completeData.acpafl_data = acpafl_data;
                    resolve(completeData);
                }
            });

        });
        
    }).then(data=>{
        return new Promise((resolve, reject)=>{
            
            var q = "SELECT * FROM act_bus_geocoded";
            dbConn.query(q, [], (error, results, fields)=>{
                if(error){
                    console.error("Error fetching act_bus_geocoded data");
                    reject(error);
                }
                else {
                    console.log("Fetched act_bus_geocoded data");
                    async.each(results, (datum, next)=>{
                        var date = datum.Start_Date.replace('/\//g', '');
                        var period = moment(date, "MMDDYYYY").fromNow();
                        //console.log(date);
                        var info = { name         : datum.Name, 
                                     address      : datum.Address, 
                                     business_type: datum.Business_Type, 
                                     start_date   : datum.Start_Date,//period,
                                     latitude     : datum.Latitude,
                                     longitude    : datum.Longitude
                                   };
                        active_business_data.push(info);
                        next();
                    },
                    error=>{
                        if(error) {
                            console.log("Error while processing acpafl data");
                            reject(error);
                        }
                        else{
                            active_business_data.sort(sortFunction);
                            data.act_bus_data = active_business_data;
                            data.act_bus_data_icon = '../images/business.png';
                            data.acpafl_data_icon = '../images/property.png';
                            console.log("Processed act_bus_data data");
                            resolve(data);
                        }
                    });
                }
            });
        });
    }).then((data)=>{
        return new Promise((resolve, reject)=>{

            var q = "SELECT * FROM tract";
            dbConn.query(q, [], (error, result, fields)=>{
                if(error){
                    console.error("Error fetching tract data");
                    reject(error);
                }
                else {
                    console.log("Fetched tract data");
                    async.each(result, (datum, next)=>{

                        // Calculate success rate with weights
                        var total_responses = (
                            datum.very_successful +
                            datum.somewhat_successful +
                            datum.somewhat_unsuccessful +
                            datum.very_unsuccessful
                        ) ;

                        var use_binary_weights = true;

                        if (use_binary_weights) {
                            var weights = {
                                very_successful: 1.0,
                                somewhat_successful: 1.0,
                                somewhat_unsuccessful: 0.0,
                                very_unsuccessful: 0.0,
                            }
                        }
                        else {
                            var weights = {
                                very_successful: 1.0,
                                somewhat_successful: 0.66,
                                somewhat_unsuccessful: 0.33,
                                very_unsuccessful: 0.0,
                            }
                        }

                        var calc_success_rate = (
                            datum.very_successful*weights.very_successful +
                            datum.somewhat_successful*weights.somewhat_successful +
                            datum.somewhat_unsuccessful*weights.somewhat_unsuccessful +
                            datum.very_unsuccessful*weights.very_unsuccessful
                        ) / total_responses;

                        var info = { name: datum.tract,
                                     geoid: datum.geoid,
                                     population: datum.population,
                                     average_income: datum.average_income,
                                     total_businesses: datum.total_businesses,
                                     success_rate: calc_success_rate,
                                     success_responses: total_responses
                                   };
                        tract_data.push(info);
                        next();
                    },
                    error=>{
                        if(error) {
                            console.log("Error while processing tract data");
                            reject(error);
                        }
                        else{
                            console.log("Processed tract data");
                            data.tract_data = tract_data;
                            resolve(data);
                        }
                    });
                }
            });

        });
        
    }).then((data)=>{

        return new Promise((resolve, reject)=>{

            var q = `SELECT Primary_Party, Location, COUNT(*) as Num_Permits, Latitude, Longitude FROM permit GROUP BY Latitude, Longitude  ORDER BY COUNT(*)`;
            dbConn.query(q, [], (error, result)=>{
                if(error){
                    console.log("Error fetching permits data");
                    reject(error);
                    
                }
                else{
                    async.each(result, (row, next)=>{
                        var loc = row.Location;
                        var address = loc.substring(0, loc.indexOf("("));
                        
                        var latitude = row.Latitude;
                        var longitude = row.Longitude;
                        if(!latitude){
                            loc = loc.substring(loc.indexOf("(")+1, loc.indexOf(")"));
                            latitude = loc.split(",")[0];
                            longitude = loc.split(",")[1];
                        }
                        
                        var info = {latitude : latitude, longitude : longitude, num_permits : row.Num_Permits, address : address, name : row.Primary_Party,
                                    location: row.location};
                        permits.push(info);
                        
                        next();
                            
                    },
                    err=>{
                        if(err){
                            console.log("Error processing permits data");
                            reject(err);
                        }
                        else{
                            permits.sort(sortFunction);
                            data.permits_data = permits;
                            data.permits_data_icon = "../images/permits.png";
                            var q = "SELECT * FROM permit";
                            dbConn.query(q, [], (err, rows)=>{
                                if(err) reject(err);
                                else{
                                    var details = {};
                                    async.each(rows, (row, cb)=>{

                                        var key = row.Latitude + row.Longitude;
                                        var value = {issue_date : row.Issue_Date, classification : row.Classification.split('>')[0], primary_party : row.Primary_Party};
                                        if(details.hasOwnProperty(row.Latitude + row.Longitude)){
                                            details[key].push(value);
                                        }
                                        else{
                                            details[key] = [value];
                                            
                                        }
                                        cb();
                                    },
                                    err=>{
                                        //console.log(details);
                                        data.completePermitsData = details;
                                        console.log("Processed permits data");
                                        dbConn.end();
                                        res.render("home", {data: data});
                                    });
                                    
                                }
                            });
                        }
                    });
                }
            });


        });

    }).catch(error=>{
        dbConn.end();
        console.log(error);
    })
    
});

app.post("/data", (req, res)=>{
    //createCSVFile(JSON.parse(req.body.data.filedata));
    res.render("data", {data: req.body.data});
});

function createCSVFile(filedata){
    // console.log(req.body.data);
    var wstream = fs.createWriteStream("PermitsData.csv");
    var headers = "Business Name,Business Type,Address,Start Date,Primary Party,Issue Date,Permit Type\n";
    wstream.write(headers);
    // console.log("written headers");
    //console.log(filedata);
    filedata.forEach(function(fd) {
        var data = dataCreation(fd);
        var flag = wstream.write(data);
    });
    wstream.end();
    console.log("rendering data");

}

function dataCreation(fd){
    var data = fd.name.replace(/,/g,' ') + ',' + fd.business_type.replace(/,/g,' ') + ',' + fd.address.replace(/,/g,' ') + ',' + fd.start_date.replace(/,/g,' ') + ',';
    var permitInfo = "";
    fd.permits.forEach(p=>{
        permitInfo += p.primary_party.replace(/,/g,' ') + ',' + p.issue_date.replace(/,/g,' ') + ',' + p.classification.replace(/,/g,' ') + '\n' + ',' + ',' +',' +',';
    });
    if(fd.permits.length === 0){
        data += '\n';
    }
    else{
        data += permitInfo;
        data = data.substr(0, data.length-4);
    }
    return data;
}


function sortFunction(a,b){
    if(a.latitude === b.latitude){
        return 0;
    }
    else{
        return  a.latitude < b.latitude ? -1 : 1;
    }
}

//Change port to required port
app.listen(80, function(){
    console.log("Server running...");
});
