import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Routes, Route } from 'react-router-dom';
import { ContentLibraryBatchOps } from '../src/pages/ContentLibraryBatchOps';

const html = renderToString(
  <StaticRouter location="/content-library/batch-ops">
    <Routes>
      <Route path="/content-library/batch-ops" element={<ContentLibraryBatchOps />} />
    </Routes>
  </StaticRouter>
);
console.log('len', html.length);
console.log(html.includes('批量操作中心') ? 'has title' : 'MISSING title');
