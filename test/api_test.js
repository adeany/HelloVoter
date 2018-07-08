
var neo4j = require('neo4j-driver').v1;
var BoltAdapter = require('node-neo4j-bolt-adapter');

var expect = require('chai').expect;
var supertest = require('supertest');
var jwt = require('jsonwebtoken');
var fetch = require('node-fetch');
var api = supertest('http://localhost:8080');
var sm_oauth = supertest(process.env.SM_OAUTH_URL);
var fs = require('fs');

var keep = (process.env.KEEP_TEST_DATA ? true : false);

var CA = JSON.parse(fs.readFileSync('./geojson/CA.geojson'));
var UT = JSON.parse(fs.readFileSync('./geojson/UT.geojson'));
var CASLDL62 = JSON.parse(fs.readFileSync('./geojson/CA-sldl-62.geojson'));

var c = {};

var tpx = "Test ";

var authToken;
var db;

var teamName1 = tpx+'Team '+Math.ceil(Math.random()*10000000);
var turfName1 = tpx+'Turf '+Math.ceil(Math.random()*10000000);
var formName1 = tpx+'Form '+Math.ceil(Math.random()*10000000);
var formId1;

var teamName2 = tpx+'Team '+Math.ceil(Math.random()*10000000);
var turfName2 = tpx+'Turf '+Math.ceil(Math.random()*10000000);
var formName2 = tpx+'Form '+Math.ceil(Math.random()*10000000);

var turfName3 = tpx+'Turf '+Math.ceil(Math.random()*10000000);

describe('API smoke', function () {

  before(async () => {
    let r;

    authToken = neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASS);
    db = new BoltAdapter(neo4j.driver('bolt://'+process.env.NEO4J_HOST, authToken));

    // clean up test data before we begin
    await db.cypherQueryAsync('match (a:Canvasser) where a.id =~ "test:.*" detach delete a');
    await db.cypherQueryAsync('match (a) where a.name =~ "'+tpx+'.*" detach delete a');

    r = await sm_oauth.get('/pubkey');
    expect(r.statusCode).to.equal(200);
    let public_key = r.body.toString();

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.admin = jwt.verify(r.body.jwt, public_key);
    c.admin.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.bob = jwt.verify(r.body.jwt, public_key);
    c.bob.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.sally = jwt.verify(r.body.jwt, public_key);
    c.sally.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.rich = jwt.verify(r.body.jwt, public_key);
    c.rich.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.jane = jwt.verify(r.body.jwt, public_key);
    c.jane.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.mike = jwt.verify(r.body.jwt, public_key);
    c.mike.jwt = r.body.jwt;

    r = await sm_oauth.get('/tokentest');
    expect(r.statusCode).to.equal(200);
    c.han = jwt.verify(r.body.jwt, public_key);
    c.han.jwt = r.body.jwt;

  });

  after(async () => {
    let ref;

    if (!keep) {
      // clean up test users
      await db.cypherQueryAsync('match (a:Canvasser) where a.id =~ "test:.*" detach delete a');
      // any left over test data??
      ref = await db.cypherQueryAsync('match (a) where a.name =~ "'+tpx+'.*" return count(a)');
    }

    db.close();

    if (!keep) {
      // check query after close, so we don't hang the test on failure
      expect(ref.data[0]).to.equal(0);
    }

    // confirm that we're all set
    const r = await api.get('/canvass/v1/uncle')
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.name).to.equal("Bob");
  });

  it('poke 200 timestamp', async () => {
    const r = await api.get('/poke');
    expect(r.statusCode).to.equal(200);
    expect(r.body.data[0]).to.satisfy(Number.isInteger);
  });

  it('hello 400 no jwt', async () => {
    const r = await api.post('/canvass/v1/hello')
    expect(r.statusCode).to.equal(400);
    expect(r.body.error).to.equal(true);
    expect(r.body.msg).to.equal("Missing required header.");
  });

  it('hello 400 bad jwt', async () => {
    let r;

    r = await sm_oauth.post('/jwt')
      .set('Content-Type', 'application/json')
      .set('User-Agent', 'OurVoiceUSA/test')
      .send({
        apiKey: "12345678765432",
      });
    expect(r.statusCode).to.equal(200);

    let jwt_bad = r.body.jwt; // this lacks an ID

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+jwt_bad)
    expect(r.statusCode).to.equal(400);
    expect(r.body.error).to.equal(true);
    expect(r.body.msg).to.equal("Your token is missing a required parameter.");
  });

  it('hello 401 wrong jwt algorithm', async () => {
    let jwt_inval = jwt.sign(JSON.stringify({
      sub: 12345,
      id: 12345,
      iss: c.admin.iss,
      iat: Math.floor(new Date().getTime() / 1000)-60,
      exp: Math.floor(new Date().getTime() / 1000)+60,
    }), Math.random().toString());

    const r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+jwt_inval)
    expect(r.statusCode).to.equal(401);
    expect(r.body.error).to.equal(true);
    expect(r.body).to.have.property("msg");
  });

  it('hello 200 admin awaiting assignment', async () => {
    let r;

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);

    // make admin an admin
    await db.cypherQueryAsync('match (a:Canvasser {id:{id}}) set a.admin=true', c.admin);

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.admin).to.equal(true);

  });

  it('hello 400 invalid params', async () => {
    let r;

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.bob.jwt)
    expect(r.statusCode).to.equal(400);
    expect(r.body.msg).to.equal("Parameters longitude and latitude must be set and numeric.");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        longitude: "abc",
        latitude: "def",
      });
    expect(r.statusCode).to.equal(400);
    expect(r.body.msg).to.equal("Parameters longitude and latitude must be set and numeric.");

  });

  it('hello 200 canvassers awaiting assignment', async () => {
    let r;

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.sally.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.rich.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.jane.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.han.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
    expect(r.body.msg).to.equal("Awaiting assignment");
    expect(r.body.data.ready).to.equal(false);
    expect(r.body.data).to.not.have.property("admin");
  });

  // TODO: check admin full list vs. non-admin only see your own team

  it('canvasser/list 200 array', async () => {
    const r = await api.get('/canvass/v1/canvasser/list')
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data).to.be.an('array');
  });

  it('canvasser/get & update', async () => {
    let r;

    for (let p in c) {
      r = await api.post('/canvass/v1/canvasser/update')
        .set('Authorization', 'Bearer '+c.admin.jwt)
        .send({
          id: c[p].id,
          name: p,
          avatar: "http://example.com/avatar.jpg",
        });
      expect(r.statusCode).to.equal(200);
    }

    r = await api.post('/canvass/v1/canvasser/update')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        id: c.bob.id,
        name: "Robert",
        avatar: "http://example.com/avatar.jpg",
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/canvasser/get?id='+c.bob.id)
      .set('Authorization', 'Bearer '+c.admin.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);
    expect(r.body.data[0].id).to.equal(c.bob.id);
    expect(r.body.data[0].display_name).to.equal("Robert");
    expect(r.body.data[0].display_avatar).to.equal("http://example.com/avatar.jpg");

    r = await api.post('/canvass/v1/canvasser/update')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        id: c.bob.id,
        name: "Bobby",
        avatar: "http://example.com/avatar.jpg",
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/canvasser/get?id='+c.bob.id)
      .set('Authorization', 'Bearer '+c.bob.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);
    expect(r.body.data[0].id).to.equal(c.bob.id);
    expect(r.body.data[0].display_name).to.equal("Bobby");
    expect(r.body.data[0].display_avatar).to.equal("http://example.com/avatar.jpg");

    r = await api.post('/canvass/v1/canvasser/update')
      .set('Authorization', 'Bearer '+c.sally.jwt)
      .send({
        id: c.bob.id,
        name: "Bestie",
        avatar: "http://example.com/avatar.jpg",
      });
    expect(r.statusCode).to.equal(403);

  });

  it('canvasser/lock 200 bob', async () => {
    let r;

    r = await api.post('/canvass/v1/canvasser/lock')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        id: c.bob.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.bob.jwt)
    expect(r.statusCode).to.equal(403);
    expect(r.body.msg).to.equal("Your account is locked.");
  });

  it('canvasser/unlock 200 bob', async () => {
    let r;

    r = await api.post('/canvass/v1/canvasser/unlock')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        id: c.bob.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/hello')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        longitude: -118.3281370,
        latitude: 33.9208231,
      });
    expect(r.statusCode).to.equal(200);
  });

  // TODO: check admin full list vs. non-admin only see your own teams

  it('team/list 200 array', async () => {
    const r = await api.get('/canvass/v1/team/list')
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data).to.be.an('array');
  });

  it('team/create 400 invalid characters', async () => {
    const r = await api.post('/canvass/v1/team/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: "*",
      });
    expect(r.statusCode).to.equal(400);
    expect(r.body).to.have.property("error");
  });

  // TODO: check admin full list vs. non-admin only see your own teams

  it('team/create & team/members/add team 1', async () => {
    let r;

    r = await api.post('/canvass/v1/team/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: teamName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/team/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: teamName1,
      });
    expect(r.statusCode).to.equal(500);
    expect(r.body.error).to.equal(true);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.post('/canvass/v1/team/members/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName1,
        cId: c.bob.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/team/members/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName1,
        cId: c.sally.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(2);

  });

  it('team/create & team/members/add team 2', async () => {
    let r;

    r = await api.post('/canvass/v1/team/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: teamName2,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName2)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.post('/canvass/v1/team/members/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName2,
        cId: c.rich.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/team/members/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName2,
        cId: c.jane.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(2);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName2)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(2);

  });

  it('canvasser/get same team', async () => {
    let r;

    r = await api.get('/canvass/v1/canvasser/get?id='+c.bob.id)
      .set('Authorization', 'Bearer '+c.admin.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);
    expect(r.body.data[0].id).to.equal(c.bob.id);
    expect(r.body.data[0].display_name).to.equal("Bobby");
    expect(r.body.data[0].display_avatar).to.equal("http://example.com/avatar.jpg");

    r = await api.get('/canvass/v1/canvasser/get?id='+c.bob.id)
      .set('Authorization', 'Bearer '+c.sally.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);
    expect(r.body.data[0].id).to.equal(c.bob.id);
    expect(r.body.data[0].display_name).to.equal("Bobby");
    expect(r.body.data[0].display_avatar).to.equal("http://example.com/avatar.jpg");

    r = await api.get('/canvass/v1/canvasser/get?id='+c.bob.id)
      .set('Authorization', 'Bearer '+c.rich.jwt)
    expect(r.statusCode).to.equal(403);
    expect(r.body).to.not.have.property("data");

    r = await api.get('/canvass/v1/canvasser/get?id='+c.jane.id)
      .set('Authorization', 'Bearer '+c.rich.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);
    expect(r.body.data[0].id).to.equal(c.jane.id);

    r = await api.get('/canvass/v1/canvasser/get?id='+c.jane.id)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);
    expect(r.body).to.not.have.property("data");

  });

  it('turf/create', async () => {
    let r;

    r = await api.post('/canvass/v1/turf/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName1,
      });
    expect(r.statusCode).to.equal(400);

    r = await api.post('/canvass/v1/turf/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName1,
        geometry: CA,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName2,
        geometry: CASLDL62.geometry,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName3,
        geometry: UT,
      });
    expect(r.statusCode).to.equal(200);

  });

  it('turf/assigned/canvasser', async () => {
    let r;

    r = await api.get('/canvass/v1/turf/assigned/canvasser/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.post('/canvass/v1/turf/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        cId: c.han.id,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        cId: c.han.id,
        turfName: turfName2,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        cId: c.han.id,
        turfName: turfName3,
      });
    expect(r.statusCode).to.equal(400);
    expect(r.body.msg).to.equal("Canvasser location is not inside that turf.")

    r = await api.post('/canvass/v1/turf/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        cId: c.han.id,
        turfName: turfName3,
        override: true,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/turf/assigned/canvasser/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(1);

  });

  it('turf/assigned/team', async () => {
    let r;

    r = await api.post('/canvass/v1/turf/assigned/team/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName1,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/assigned/team/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName2,
        turfName: turfName2,
      });
    expect(r.statusCode).to.equal(200);

  });


  it('form/create & form/assigned add', async () => {
    let r;

    r = await api.post('/canvass/v1/form/create')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: formName1,
      });
    expect(r.statusCode).to.equal(200);
    formId1 = r.body.data[0].id;

    r = await api.post('/canvass/v1/form/assigned/team/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        fId: formId1,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/form/assigned/team/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        fId: formId1,
        teamName: teamName2,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/form/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        fId: formId1,
        cId: c.han.id,
      });
    expect(r.statusCode).to.equal(200);

  });

  it('sync', async () => {
    let r;

    r = await api.post('/canvass/v1/sync')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);
    expect(r.body.msg).to.equal("Canvasser is not assigned.");

    r = await api.post('/canvass/v1/sync')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        formId: 'asdfadsf',
        nodes: {},
      });
    expect(r.statusCode).to.equal(403);
    expect(r.body.msg).to.equal("Canvasser is not assigned to this form.");

    r = await api.post('/canvass/v1/sync')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        formId: formId1,
      });
    expect(r.statusCode).to.equal(400);
    expect(r.body.msg).to.equal("nodes must be an object.");

    r = await api.post('/canvass/v1/sync')
      .set('Authorization', 'Bearer '+c.bob.jwt)
      .send({
        formId: formId1,
        nodes: {},
      });
    expect(r.statusCode).to.equal(200);
    expect(typeof r.body.nodes).to.equal("object");

  });

  it('non-admin permission denied', async () => {
    let r;

    r = await api.get('/canvass/v1/canvasser/get?id='+c.sally.id)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/canvasser/update?id='+c.sally.id)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/canvasser/unassigned')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/canvasser/lock')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        id: c.sally.id,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/canvasser/unlock')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        id: c.sally.id,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/team/create')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        name: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/team/delete')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        name: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/team/members/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        cId: c.mike.id,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/team/members/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        cId: c.sally.id,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/create')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        name: turfName1,
        geometry: CA,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/delete')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        name: turfName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/turf/assigned/team/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/assigned/team/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        turfName: turfName1,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/assigned/team/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        teamName: teamName1,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/turf/assigned/canvasser/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        cId: c.mike.id,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/turf/assigned/canvasser/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        cId: c.mike.id,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/form/get?id='+formId1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/create')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        name: formName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/delete')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        id: formId1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/form/assigned/team/list?id='+formId1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/assigned/team/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/assigned/team/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        teamName: teamName1,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/form/assigned/canvasser/list?id='+formId1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/assigned/canvasser/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        cId: c.mike.id,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/form/assigned/canvasser/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        cId: c.sally.id,
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/question/get?key=reality')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/question/list')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/question/create')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        key: 'reality',
        label: 'Do you question reality?',
        type: 'String',
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/question/delete')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        key: 'reality',
      });
    expect(r.statusCode).to.equal(403);

    r = await api.get('/canvass/v1/question/assigned/list?key=reality')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/question/assigned/add')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        key: 'reality',
      });
    expect(r.statusCode).to.equal(403);

    r = await api.post('/canvass/v1/question/assigned/remove')
      .set('Authorization', 'Bearer '+c.mike.jwt)
      .send({
        fId: formId1,
        key: 'reality',
      });
    expect(r.statusCode).to.equal(403);

  });

  it('non-admin unassigned zero visibility', async () => {
    let r;

    r = await api.get('/canvass/v1/canvasser/list')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.get('/canvass/v1/team/list')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.get('/canvass/v1/turf/list')
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.get('/canvass/v1/form/list?id='+formId1)
      .set('Authorization', 'Bearer '+c.mike.jwt)
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

  });

  (keep?it.skip:it)('turf/assigned/canvasser/remove', async () => {
    let r;

    r = await api.post('/canvass/v1/turf/assigned/canvasser/remove')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        cId: c.han.id,
        turfName: turfName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/turf/assigned/canvasser/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

  });

  (keep?it.skip:it)('team/members/remove & team/delete', async () => {
    let r;

    r = await api.post('/canvass/v1/team/members/remove')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName1,
        cId: c.bob.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/team/members/remove')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        teamName: teamName1,
        cId: c.sally.id,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/team/members/list?teamName='+teamName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.post('/canvass/v1/team/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: teamName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/team/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: teamName2,
      });
    expect(r.statusCode).to.equal(200);

  });

  (keep?it.skip:it)('turf/delete', async () => {
    let r;

    r = await api.get('/canvass/v1/turf/assigned/team/list?turfName='+turfName1)
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(0);

    r = await api.post('/canvass/v1/turf/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName2,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.post('/canvass/v1/turf/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        name: turfName3,
      });
    expect(r.statusCode).to.equal(200);

  });

  (keep?it.skip:it)('form/delete', async () => {
    let r;

    r = await api.get('/canvass/v1/form/list')
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    let count = r.body.data.length;

    r = await api.post('/canvass/v1/form/delete')
      .set('Authorization', 'Bearer '+c.admin.jwt)
      .send({
        id: formId1,
      });
    expect(r.statusCode).to.equal(200);

    r = await api.get('/canvass/v1/form/list')
      .set('Authorization', 'Bearer '+c.admin.jwt);
    expect(r.statusCode).to.equal(200);
    expect(r.body.data.length).to.equal(count-1);

  });

});

