import React, { useState, useCallback, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

declare const XLSX: any;

const removeDiacritics = (str: string) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

interface Mapping {
  [target: string]: string | null;
}

interface Filter {
    id: number;
    column: string;
    value: string[];
}

const SearchableSelect = ({ options, value, onChange, placeholder }: { options: string[], value: string, onChange: (value: string) => void, placeholder: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option => 
    removeDiacritics(option.toLowerCase()).includes(removeDiacritics(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="searchable-select-container" ref={selectRef}>
      <div className="searchable-select-display" onClick={() => setIsOpen(!isOpen)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}>
        {value ? (<span>{value}</span>) : (<span className="placeholder">{placeholder}</span>)}
        <span className="searchable-select-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && (
        <div className="searchable-select-dropdown">
          <input
            type="text"
            className="searchable-select-search"
            placeholder="Hľadať..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          <ul className="searchable-select-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <li key={option} onClick={() => handleSelect(option)} className="searchable-select-option" role="option" aria-selected={value === option}>
                  {option}
                </li>
              ))
            ) : (
              <li className="searchable-select-no-options">Nenašli sa žiadne výsledky</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

const MultiSelectWithCheckbox = ({ options, selectedValues, onChange, placeholder, disabled }: { options: string[], selectedValues: string[], onChange: (values: string[]) => void, placeholder: string, disabled?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(option => 
    removeDiacritics(String(option).toLowerCase()).includes(removeDiacritics(searchTerm.toLowerCase()))
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleOption = (option: string) => {
    const newSelectedValues = selectedValues.includes(option)
      ? selectedValues.filter(v => v !== option)
      : [...selectedValues, option];
    onChange(newSelectedValues);
  };
  
  const getDisplayValue = () => {
      if (selectedValues.length === 0) {
          return <span className="placeholder">{placeholder}</span>;
      }
      if (selectedValues.length === 1) {
          return <span>{selectedValues[0]}</span>;
      }
      return <span>{selectedValues.length} vybraných</span>;
  };

  return (
    <div className={`multi-select-container ${disabled ? 'disabled' : ''}`} ref={selectRef}>
      <div className="multi-select-display" onClick={() => !disabled && setIsOpen(!isOpen)} role="button" tabIndex={disabled ? -1 : 0} onKeyDown={(e) => !disabled && e.key === 'Enter' && setIsOpen(!isOpen)}>
        {getDisplayValue()}
        <span className="multi-select-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      {isOpen && !disabled && (
        <div className="multi-select-dropdown">
          <input
            type="text"
            className="multi-select-search"
            placeholder="Hľadať..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
          />
          <ul className="multi-select-options">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <li key={option} onClick={() => handleToggleOption(option)} className="multi-select-option" role="option" aria-selected={selectedValues.includes(option)}>
                  <input type="checkbox" readOnly checked={selectedValues.includes(option)} />
                  <span>{option}</span>
                </li>
              ))
            ) : (
              <li className="multi-select-no-options">Nenašli sa žiadne výsledky</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};


const App = () => {
  const [targetHeaders, setTargetHeaders] = useState<string[]>([]);
  const [sourceHeaders, setSourceHeaders] = useState<string[]>([]);
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  
  const [outputFormat, setOutputFormat] = useState<'xlsx' | 'csv'>('xlsx');

  // State for static text values
  const [staticValues, setStaticValues] = useState<{ [key: string]: string }>({});
  const [editingStaticField, setEditingStaticField] = useState<string | null>(null);
  const [editingStaticValue, setEditingStaticValue] = useState('');

  // State for multiple filters
  const [filters, setFilters] = useState<Filter[]>([]);

  // Automatically save mapping configuration to localStorage whenever it changes
  useEffect(() => {
    if (targetHeaders.length > 0) {
      const config = {
        targetHeaders,
        mapping,
        staticValues,
      };
      localStorage.setItem('excelMapperConfig', JSON.stringify(config));
    }
  }, [targetHeaders, mapping, staticValues]);

  const getUniqueValuesForColumn = useCallback((columnName: string) => {
    if (!columnName || sourceData.length === 0) {
        return [];
    }
    const values = new Set(
        sourceData
            .map(row => row[columnName])
            .filter(val => val !== null && val !== undefined && val !== '')
    );
    return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
  }, [sourceData]);

  const handleFile = (file: File, type: 'target' | 'source') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      if (type === 'target') {
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (json.length > 0) {
          const headers = (json[0] as string[]).filter(h => h && h.trim() !== '');
          setTargetHeaders(headers);
          setTargetFile(file);
          
          const savedConfigRaw = localStorage.getItem('excelMapperConfig');
          let loadedFromStorage = false;
          if (savedConfigRaw) {
              try {
                  const savedConfig = JSON.parse(savedConfigRaw);
                  if (savedConfig.targetHeaders && JSON.stringify(savedConfig.targetHeaders) === JSON.stringify(headers)) {
                      setMapping(savedConfig.mapping || {});
                      setStaticValues(savedConfig.staticValues || {});
                      loadedFromStorage = true;
                  }
              } catch (error) {
                  console.error("Failed to parse or apply saved config from localStorage", error);
              }
          }

          if (!loadedFromStorage) {
              const newMapping: Mapping = {};
              headers.forEach(h => newMapping[h] = null);
              setMapping(newMapping);
              setStaticValues({});
          }
        } else {
           alert("Cieľový súbor je prázdny alebo má nesprávny formát.");
        }
      } else { // source
        const headers = (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[]).filter(h => h && h.trim() !== '');
        setSourceHeaders(headers);
        setSourceData(XLSX.utils.sheet_to_json(worksheet, { cellDates: true }));
        setSourceFile(file);
        setFilters([]); // Reset filters on new source file
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, header: string) => {
    setDraggedItem(header);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLIElement>) => {
    e.currentTarget.classList.remove('drag-over');
  };
  
  const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetHeader: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (draggedItem && !Object.values(mapping).includes(draggedItem)) {
      setMapping(prev => ({ ...prev, [targetHeader]: draggedItem }));
      // When a source is mapped, clear any static value
      clearStaticValue(targetHeader);
    }
    setDraggedItem(null);
  };
  
  const unmapField = (targetHeader: string) => {
    setMapping(prev => ({ ...prev, [targetHeader]: null }));
  }

  // --- Static Value Handlers ---
  const clearStaticValue = (header: string) => {
    setStaticValues(prev => {
        const next = {...prev};
        delete next[header];
        return next;
    });
  };

  const handleStaticEditStart = (header: string) => {
    if (mapping[header]) return; // Don't allow edit if mapped from source
    setEditingStaticValue(staticValues[header] || '');
    setEditingStaticField(header);
  };

  const handleStaticValueSave = () => {
    if (editingStaticField) {
      const trimmedValue = editingStaticValue.trim();
      if (trimmedValue) {
        setStaticValues(prev => ({
          ...prev,
          [editingStaticField]: trimmedValue,
        }));
        // Clear any source mapping for this field
        setMapping(prev => ({ ...prev, [editingStaticField]: null }));
      } else {
        clearStaticValue(editingStaticField);
      }
    }
    setEditingStaticField(null);
    setEditingStaticValue('');
  };

  const handleStaticKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleStaticValueSave();
    } else if (e.key === 'Escape') {
      setEditingStaticField(null);
      setEditingStaticValue('');
    }
  };

  // --- Filter handlers ---
  const handleAddFilter = () => {
    setFilters(prev => [...prev, { id: Date.now(), column: '', value: [] }]);
  };

  const handleRemoveFilter = (id: number) => {
    setFilters(prev => prev.filter(f => f.id !== id));
  };

  const handleFilterChange = (id: number, field: 'column' | 'value', newValue: string | string[]) => {
    setFilters(prev =>
      prev.map(f => {
        if (f.id === id) {
          const updatedFilter = { ...f, [field]: newValue };
          // If column changes, reset value array
          if (field === 'column') {
            updatedFilter.value = [];
          }
          return updatedFilter;
        }
        return f;
      })
    );
  };

  const generateFile = () => {
    if (Object.values(mapping).every(v => v === null) && Object.keys(staticValues).length === 0) {
      alert("Musíte priradiť aspoň jedno pole alebo zadať statickú hodnotu.");
      return;
    }
    setIsGenerating(true);

    setTimeout(() => {
        const activeFilters = filters.filter(f => f.column && f.value.length > 0);

        const dataToProcess = activeFilters.length > 0
          ? sourceData.filter(row =>
              activeFilters.every(filter => {
                const rowValue = String(row[filter.column]);
                return filter.value.includes(rowValue);
              })
            )
          : sourceData;

        const outputData: any[] = [targetHeaders];

        dataToProcess.forEach(row => {
            const newRow: any[] = [];
            targetHeaders.forEach(targetHeader => {
                const sourceHeader = mapping[targetHeader];
                const staticValue = staticValues[targetHeader];
                let cellValue;

                if (staticValue !== undefined) {
                    cellValue = staticValue;
                } else if (sourceHeader) {
                    cellValue = row[sourceHeader];
                } else {
                    cellValue = "";
                }
                newRow.push(cellValue ?? "");
            });
            outputData.push(newRow);
        });

        const worksheet = XLSX.utils.aoa_to_sheet(outputData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Mapované dáta');

        if (outputFormat === 'xlsx') {
            XLSX.writeFile(workbook, 'mapped_data.xlsx');
        } else {
            XLSX.writeFile(workbook, 'mapped_data.csv', { bookType: "csv" });
        }
        
        setIsGenerating(false);
    }, 500);
  };

  const mappedSourceHeaders = new Set(Object.values(mapping));
  const hasMappings = Object.values(mapping).some(v => v !== null) || Object.keys(staticValues).length > 0;

  const filteredSourceHeaders = sourceHeaders.filter(header => {
    const normalizedHeader = removeDiacritics(header.toLowerCase());
    const normalizedQuery = removeDiacritics(sourceSearchQuery.toLowerCase());
    return normalizedHeader.includes(normalizedQuery);
  });


  return (
    <div className="container">
      <header>
        <h1>Nástroj na Mapovanie Excelu</h1>
        <p>Nahrajte súbory, priraďte polia pomocou drag & drop alebo vložte statický text a vygenerujte nový súbor.</p>
      </header>
      
      <div className="card upload-card">
        <h2>1. Nahrajte súbory</h2>
        <div className="upload-area">
            <div>
              <label className="file-upload-wrapper">
                Nahrať cieľový súbor
                <input type="file" onChange={(e) => e.target.files && handleFile(e.target.files[0], 'target')} accept=".xlsx, .xls, .csv" />
              </label>
              {targetFile && <span className="file-name" title={targetFile.name}>{targetFile.name}</span>}
            </div>
            <div>
              <label className="file-upload-wrapper">
                Nahrať zdrojový súbor
                <input type="file" onChange={(e) => e.target.files && handleFile(e.target.files[0], 'source')} accept=".xlsx, .xls, .csv" />
              </label>
              {sourceFile && <span className="file-name" title={sourceFile.name}>{sourceFile.name}</span>}
            </div>
        </div>
      </div>
      
      {sourceHeaders.length > 0 && (
          <div className="card filter-card">
              <h2>2. Filter zdrojových dát (nepovinné)</h2>
              <div className="filter-controls">
                {filters.map(filter => {
                  const uniqueValues = getUniqueValuesForColumn(filter.column);
                  return (
                    <div key={filter.id} className="filter-row">
                      <div className="filter-group">
                        <label htmlFor={`filter-column-${filter.id}`}>Filtrovať podľa stĺpca:</label>
                         <SearchableSelect
                            placeholder="-- Nevybraté --"
                            options={sourceHeaders}
                            value={filter.column}
                            onChange={(newCol) => handleFilterChange(filter.id, 'column', newCol)}
                          />
                      </div>
                      <div className="filter-group">
                        <label htmlFor={`filter-value-${filter.id}`}>Hodnota:</label>
                        <MultiSelectWithCheckbox
                            placeholder="-- Vyberte hodnoty --"
                            options={uniqueValues.map(String)}
                            selectedValues={filter.value}
                            onChange={(newValues) => handleFilterChange(filter.id, 'value', newValues)}
                            disabled={!filter.column || uniqueValues.length === 0}
                        />
                      </div>
                       <button onClick={() => handleRemoveFilter(filter.id)} className="remove-filter-btn" title="Odstrániť filter">
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                       </button>
                    </div>
                  );
                })}
              </div>
               <button onClick={handleAddFilter} className="add-filter-btn">
                + Pridať filter
               </button>
          </div>
      )}

      {(sourceHeaders.length > 0 || targetHeaders.length > 0) && (
        <div className="main-content">
          <div className="column">
            {sourceHeaders.length > 0 && (
              <div className="card card-scrollable">
                <h2>Zdrojové polia (drag)</h2>
                <input
                  type="text"
                  placeholder="Vyhľadať polia..."
                  className="search-input"
                  value={sourceSearchQuery}
                  onChange={(e) => setSourceSearchQuery(e.target.value)}
                  aria-label="Vyhľadať zdrojové polia"
                />
                <ul className="source-fields-list">
                  {filteredSourceHeaders.map(header => (
                    <li 
                      key={header} 
                      className={`source-field ${mappedSourceHeaders.has(header) ? 'mapped' : ''}`}
                      draggable={!mappedSourceHeaders.has(header)}
                      onDragStart={(e) => handleDragStart(e, header)}
                      aria-grabbed={mappedSourceHeaders.has(header) ? undefined : false}
                    >
                      {header}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <div className="column">
            {targetHeaders.length > 0 && (
              <div className="card card-scrollable">
                <h2>3. Cieľové polia (drop)</h2>
                <ul className="target-fields-list">
                  {targetHeaders.map(header => (
                    <li 
                      key={header} 
                      className="target-field"
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, header)}
                      aria-dropeffect="move"
                    >
                      <span className="target-field-name">{header}</span>
                      <div 
                        className="target-drop-zone"
                        onClick={() => {
                            if (!mapping[header] && staticValues[header] === undefined && !editingStaticField) {
                                handleStaticEditStart(header);
                            }
                        }}
                      >
                        {editingStaticField === header ? (
                            <input
                                type="text"
                                className="static-value-input"
                                value={editingStaticValue}
                                onChange={(e) => setEditingStaticValue(e.target.value)}
                                onBlur={handleStaticValueSave}
                                onKeyDown={handleStaticKeyDown}
                                onClick={e => e.stopPropagation()}
                                autoFocus
                            />
                        ) : staticValues[header] !== undefined ? (
                            <div className="static-value-container" onClick={(e) => { e.stopPropagation(); handleStaticEditStart(header); }}>
                                <span className="static-value-text" title={staticValues[header]}>
                                    "{staticValues[header]}"
                                </span>
                                <button className="clear-button" onClick={(e) => { e.stopPropagation(); clearStaticValue(header);}} title="Odstrániť statickú hodnotu">
                                    &times;
                                </button>
                            </div>
                        ) : mapping[header] ? (
                          <div className="mapped-container">
                            <span className="mapped-source-field" onClick={() => unmapField(header)} title="Kliknutím odstránite priradenie">
                              ← {mapping[header]}
                            </span>
                          </div>
                        ) : (
                          <span className="placeholder">Presuňte pole alebo kliknite</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                
                <div className="output-format-selector">
                  <span className="format-label">Formát výstupu:</span>
                  <div className="radio-group">
                      <label>
                          <input
                              type="radio"
                              name="outputFormat"
                              value="xlsx"
                              checked={outputFormat === 'xlsx'}
                              onChange={() => setOutputFormat('xlsx')}
                          />
                          XLSX
                      </label>
                      <label>
                          <input
                              type="radio"
                              name="outputFormat"
                              value="csv"
                              checked={outputFormat === 'csv'}
                              onChange={() => setOutputFormat('csv')}
                          />
                          CSV (oddelené čiarkou)
                      </label>
                  </div>
                </div>

                <button 
                  className="generate-button"
                  onClick={generateFile}
                  disabled={isGenerating || !hasMappings}
                >
                  {isGenerating ? 'Generujem...' : `4. Generovať ${outputFormat.toUpperCase()}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}