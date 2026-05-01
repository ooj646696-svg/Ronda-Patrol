import React, { useState, useEffect } from 'react';
import './Pagination.css';

export function Pagination({ 
  data, 
  itemsPerPage = 10, 
  onPageChange,
  children 
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPageState, setItemsPerPageState] = useState(itemsPerPage);

  // Calculate total pages
  const totalPages = Math.ceil(data.length / itemsPerPageState);

  // Get current page data
  const indexOfLastItem = currentPage * itemsPerPageState;
  const indexOfFirstItem = indexOfLastItem - itemsPerPageState;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);

  // Reset to page 1 if items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPageState]);

  // Change page
  const paginate = (pageNumber) => {
    setCurrentPage(pageNumber);
    if (onPageChange) {
      onPageChange(pageNumber, itemsPerPageState);
    }
  };

  // Handle items per page change
  const handleItemsPerPageChange = (e) => {
    setItemsPerPageState(Number(e.target.value));
  };

  // Generate page numbers
  const pageNumbers = [];
  const maxVisiblePages = 5;
  
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
  }

  return (
    <>
      {children(currentItems)}
      
      {totalPages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, data.length)} of {data.length} entries
          </div>
          
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => paginate(1)}
              disabled={currentPage === 1}
            >
              First
            </button>
            
            <button
              className="pagination-btn"
              onClick={() => paginate(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </button>
            
            <div className="pagination-page-numbers">
              {pageNumbers.map(number => (
                <button
                  key={number}
                  className={`pagination-btn ${currentPage === number ? 'active' : ''}`}
                  onClick={() => paginate(number)}
                >
                  {number}
                </button>
              ))}
            </div>
            
            <button
              className="pagination-btn"
              onClick={() => paginate(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
            
            <button
              className="pagination-btn"
              onClick={() => paginate(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </button>
          </div>
          
          <div className="pagination-controls">
            <select
              className="pagination-select"
              value={itemsPerPageState}
              onChange={handleItemsPerPageChange}
            >
              <option value={10}>10 per page</option>
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
