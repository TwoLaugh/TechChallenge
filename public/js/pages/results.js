// Results page logic
(function(){
  // UI helper functions
  function setLoading() {
    const container = document.querySelector('.container');
    if (!container) return;
    container.innerHTML = `
      <div class="text-center py-8">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">Loading your results...</p>
      </div>
    `;
  }

  function showError(message) {
    const container = document.querySelector('.container');
    if (!container) return;
    container.innerHTML = `
      <div class="bg-red-50 border border-red-200 rounded-lg p-6 mt-8">
        <h2 class="text-xl font-semibold text-red-800 mb-4">Error Loading Results</h2>
        <p class="text-gray-700">Sorry, we couldn't load your results. This might be because:</p>
        <ul class="list-disc ml-6 mt-2 mb-4 text-gray-700">
          <li>The symptom check wasn't completed</li>
          <li>Your session has expired</li>
          <li>Required information is missing</li>
        </ul>
        ${message ? `
          <div class="mt-4 p-4 bg-red-100 rounded-md">
            <p class="text-sm text-red-700">Technical details: ${message}</p>
          </div>
        ` : ''}
        <div class="mt-6 flex gap-4">
          <a href="check.html" class="inline-block px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">Start New Check</a>
          <button onclick="window.history.back()" class="inline-block px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Go Back</button>
        </div>
      </div>
    `;
  }

  function generateMedicationCard(med) {
    if (!med) return '';
    
    const sections = [];
    
    if (med.ingredient) {
      sections.push(`
        <div>
          <p class="text-sm font-medium text-gray-500">Active Ingredient</p>
          <p class="text-gray-900">${med.ingredient}</p>
        </div>
      `);
    }
    
    if (med.description) {
      sections.push(`
        <div>
          <p class="text-sm font-medium text-gray-500">Description</p>
          <p class="text-gray-900">${med.description}</p>
        </div>
      `);
    }
    
    if (med.dosage) {
      sections.push(`
        <div>
          <p class="text-sm font-medium text-gray-500">Dosage Information</p>
          <p class="text-gray-900">${med.dosage}</p>
        </div>
      `);
    }

    if (med.ageLimits || (med.pediatric && med.pediatric.length)) {
      const ageLines = [];
      if (med.ageLimits?.min_years != null || med.ageLimits?.max_years != null) {
        const parts = [];
        if (med.ageLimits.min_years != null) parts.push(`Minimum age ${med.ageLimits.min_years} years`);
        if (med.ageLimits.max_years != null) parts.push(`Maximum age ${med.ageLimits.max_years} years`);
        ageLines.push(parts.join(' · '));
      }
      if (med.ageLimits?.note) {
        ageLines.push(med.ageLimits.note);
      }
      if (Array.isArray(med.pediatric) && med.pediatric.length) {
        med.pediatric.forEach(entry => {
          if (typeof entry === 'string') {
            ageLines.push(entry);
          } else if (entry) {
            const label = entry.age_range ? `<strong>${entry.age_range}:</strong> ` : '';
            const dose = entry.dose || entry.guidance || '';
            const extra = entry.max_daily ? ` (max ${entry.max_daily})` : '';
            ageLines.push(`${label}${dose}${extra}`);
          }
        });
      }

      if (ageLines.length) {
        sections.push(`
          <div class="bg-teal-50 p-3 rounded-md">
            <p class="text-sm font-medium text-teal-800 mb-2">Age & dosing guidance</p>
            <ul class="list-disc ml-4 space-y-1">
              ${ageLines.map(line => `<li class="text-teal-700">${line}</li>`).join('')}
            </ul>
          </div>
        `);
      }
    }

    if (med.whenToTake && med.whenToTake.length) {
      sections.push(`
        <div class="bg-blue-50 p-3 rounded-md">
          <p class="text-sm font-medium text-blue-800 mb-2">When to Take</p>
          <ul class="list-disc ml-4 space-y-1">
            ${med.whenToTake.map(item => `<li class="text-blue-700">${item}</li>`).join('')}
          </ul>
        </div>
      `);
    }
    
    if (med.usage && med.usage.length) {
      sections.push(`
        <div>
          <p class="text-sm font-medium text-gray-500">Usage Instructions</p>
          <ul class="list-disc ml-4 space-y-1">
            ${med.usage.map(item => `<li class="text-gray-700">${item}</li>`).join('')}
          </ul>
        </div>
      `);
    }
    
    if (med.sideEffects && med.sideEffects.length) {
      sections.push(`
        <div class="bg-yellow-50 p-3 rounded-md">
          <p class="text-sm font-medium text-yellow-800 mb-2">Side Effects</p>
          <ul class="list-disc ml-4 space-y-1">
            ${med.sideEffects.map(item => `<li class="text-yellow-700">${item}</li>`).join('')}
          </ul>
        </div>
      `);
    }

    return `
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 class="text-xl font-semibold text-blue-800 mb-3">${med.name || 'Medication'}</h3>
        <div class="space-y-4">
          ${sections.join('')}
        </div>
      </div>
    `;
  }

  function bootstrapLayout(title) {
    const container = document.querySelector('.container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="results-layout">
        <header class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-800 mb-2">${title || 'Your Medication Results'}</h1>
          <p class="text-gray-600">Based on your symptoms, here are our recommendations</p>
        </header>

        <div class="space-y-8">
          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Patient Summary</h2>
            <div id="patient-summary" class="grid md:grid-cols-2 gap-4"></div>
          </section>

          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Recommended Medications</h2>
            <div id="medication-results" class="space-y-4"></div>
          </section>

          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Timing & Frequency</h2>
            <div id="medication-timing"></div>
          </section>
          
          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Administration Instructions</h2>
            <div id="administration"></div>
          </section>
          
          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Storage Guidelines</h2>
            <div id="storage"></div>
          </section>
          
          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Self-Care Advice</h2>
            <div id="self-care"></div>
          </section>

          <section>
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Medicine Handling Essentials</h2>
            <div id="detailed-info"></div>
          </section>

          <section>
            <h2 class="text-2xl font-semibold text-red-800 mb-4">Important Warnings</h2>
            <div id="warnings"></div>
          </section>
        </div>
        
        <div class="mt-8 text-center">
          <a href="check.html" class="inline-block px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 mr-4">Start New Check</a>
          <button onclick="window.print()" class="inline-block px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">Print Results</button>
        </div>
      </div>
    `;
  }

  function renderPatientSummary(state) {
    if (!state) return '<p class="text-gray-600">No patient details available.</p>';
    const items = [
      { label: 'Condition', value: state.condition || '-' },
      { label: 'Who', value: state.who || '-' },
      { label: 'Duration', value: state.duration || '-' },
      { label: 'Current meds', value: state.meds || '-' },
      { label: 'Action taken', value: state.action || '-' }
    ];
    return items.map(item => `
      <div class="bg-white border border-gray-200 rounded-lg p-4">
        <p class="text-sm font-medium text-gray-500">${item.label}</p>
        <p class="text-lg text-gray-900">${item.value || '-'}</p>
      </div>
    `).join('');
  }

  function displayResults(results, storedState) {
    try {
      bootstrapLayout(results.title);

      // Get all section elements
      const sections = {
        summary: document.getElementById('patient-summary'),
        medications: document.getElementById('medication-results'),
        timing: document.getElementById('medication-timing'),
        administration: document.getElementById('administration'),
        storage: document.getElementById('storage'),
        selfCare: document.getElementById('self-care'),
        warnings: document.getElementById('warnings'),
        detailed: document.getElementById('detailed-info')
      };

      if (sections.summary) {
        sections.summary.innerHTML = renderPatientSummary(storedState);
      }

      // Display medications
      if (sections.medications && results.advice?.length) {
        sections.medications.innerHTML = results.advice.map(med => generateMedicationCard(med)).join('');
      }

      // Display timing information
      if (sections.timing && results.generalTiming?.length) {
        sections.timing.innerHTML = `
          <div class="bg-blue-50 p-4 rounded-lg">
            <ul class="list-disc ml-4 space-y-2">
              ${results.generalTiming.map(item => `<li class="text-blue-700">${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Display administration instructions
      if (sections.administration && results.administration?.length) {
        sections.administration.innerHTML = `
          <div class="p-4">
            <ul class="list-disc ml-4 space-y-2">
              ${results.administration.map(item => `<li class="text-gray-700">${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Display storage instructions
      if (sections.storage && results.storage?.length) {
        sections.storage.innerHTML = `
          <div class="bg-gray-50 p-4 rounded-lg">
            <ul class="list-disc ml-4 space-y-2">
              ${results.storage.map(item => `<li class="text-gray-600">${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      // Display self-care advice
      if (sections.selfCare && results.selfCare?.length) {
        sections.selfCare.innerHTML = `
          <div class="bg-green-50 p-4 rounded-lg">
            <ul class="list-disc ml-4 space-y-2">
              ${results.selfCare.map(item => `<li class="text-green-700">${item}</li>`).join('')}
            </ul>
          </div>
        `;
      }

      if (sections.detailed && window.ResultHelpers?.generateDetailedInformation) {
        const warningObjects = (results.warnings || []).map(item => ({ text: item, critical: results.flags?.includes(item) }));
        const detailedHtml = window.ResultHelpers.generateDetailedInformation({
          timing: results.generalTiming || [],
          special: results.storage || [],
          warnings: warningObjects
        });
        sections.detailed.innerHTML = detailedHtml;
      }

      // Display warnings and flags
      if (sections.warnings) {
        const warningContent = [];

        if (results.flags?.length) {
          warningContent.push(`
            <div class="bg-red-100 p-4 rounded-lg mb-4">
              <h3 class="font-semibold text-red-800 mb-2">⚠️ Red Flags - Seek Medical Attention</h3>
              <ul class="list-disc ml-4 space-y-2">
                ${results.flags.map(flag => `<li class="text-red-700">${flag}</li>`).join('')}
              </ul>
            </div>
          `);
        }

        if (results.warnings?.length) {
          warningContent.push(`
            <div class="bg-orange-50 p-4 rounded-lg">
              <h3 class="font-semibold text-orange-800 mb-2">Important Safety Warnings</h3>
              <ul class="list-disc ml-4 space-y-2">
                ${results.warnings.map(warning => `<li class="text-orange-700">${warning}</li>`).join('')}
              </ul>
            </div>
          `);
        }

        sections.warnings.innerHTML = warningContent.join('');
      }

    } catch (error) {
      console.error('Error displaying results:', error);
      showError(error.message);
    }
  }

  // Initialize the page
  document.addEventListener('DOMContentLoaded', async function() {
    console.log('Results page initializing...');

    try {
      // Check if modules are loaded
      console.log('StateManager available:', !!window.StateManager);
      console.log('Engine available:', !!window.Engine);
      
      const state = window.StateManager?.getStoredState();
      console.log('Stored state:', state);
      
      if (!state?.condition || !state?.who) {
        console.log('Missing required state - condition:', state?.condition, 'who:', state?.who);
        showError('Missing condition or patient type. Please complete the symptom check first.');
        return;
      }

      setLoading();

      try {
        if (window.Engine?.ready) {
          await window.Engine.ready();
        }

        console.log('Attempting to evaluate state...');
        const result = window.Engine?.evaluate(state);
        console.log('Engine result:', result);

        if (!result) {
          showError('No results generated by the engine');
          return;
        }

        displayResults(result, state);
        window.StateManager?.clearState?.();
      } catch (engineError) {
        console.error('Engine evaluation error:', engineError);
        showError(`Engine error: ${engineError.message}`);
      }

    } catch (error) {
      console.error('Error initializing results:', error);
      showError(`Initialization error: ${error.message}`);
    }
  });

})();
