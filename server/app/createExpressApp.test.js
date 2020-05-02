import { expect } from 'chai';
import _ from 'lodash';

import { appInit, base_uri } from '../test/lib/utils';
import { doExpressInit } from './createExpressApp';
import { hv_config } from './lib/hv_config';
import neo4j from './lib/neo4j';

var db;

describe('doExpressInit', function () {

  before(() => {
    db = new neo4j(hv_config);
  });

  after(async () => {
    db.close();
  });

  it('ip_header check', async () => {
    let api = await appInit(db, _.merge({}, hv_config, {ip_header: 'x-client-ip'}));
    let r = await api.get(base_uri);
    expect(r.statusCode).to.equal(400);
    expect(r.body.msg).to.equal('Missing required header.');

    r = await api.get(base_uri)
      .set('x-client-ip', '127.0.0.1')
      .set('Authorization', 'Bearer foo')
    expect(r.statusCode).to.equal(401);
  });

  it('fetch public key', async () => {
    let api = await appInit(db, _.merge({}, hv_config, {jwt_pub_key: null}));
    let r = await api.get(base_uri+'/public/poke');
    expect(r.statusCode).to.equal(200);
  });

  it('fetch bad public key', async () => {
    let api = await doExpressInit({db, logger: (l,m,n) => {n()}, config: _.merge({}, hv_config, {jwt_pub_key: null, sm_oauth_url: 'http://localhost:9991'})});
    expect(api.error).to.equal(true);
  });

});
