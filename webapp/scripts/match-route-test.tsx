import React from 'react';
import { createRoutesFromElements, Route, matchRoutes } from 'react-router-dom';

const routes = createRoutesFromElements(
  <Route path="/" element={null}>
    <Route path="content-library/batch-ops" element={null} />
  </Route>
);

const m = matchRoutes(routes, '/content-library/batch-ops');
console.log(JSON.stringify(m?.map(x => ({ pathname: x.pathname, routePath: x.route.path })), null, 2));
