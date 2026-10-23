/**
 * Utility to filter old records for newly created Managers and Agents.
 * Admins always see all records.
 * Managers and Agents only see records created on or after their join timestamp.
 */

export const getLoggedInUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const getUserJoinDate = (user) => {
  if (!user) return null;
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return null;

  let dateVal = user.joinDate || user.createdAt;
  if (!dateVal) {
    const idStr = String(user._id || user.id || '').trim();
    if (idStr.length >= 8 && /^[0-9a-fA-F]{8}/.test(idStr)) {
      try {
        const timestampSec = parseInt(idStr.substring(0, 8), 16);
        dateVal = new Date(timestampSec * 1000);
      } catch (e) {}
    }
  }

  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return d;
};

export const getRecordTimestamp = (record, customDate = null) => {
  if (!record && !customDate) return null;

  if (customDate) {
    const d = customDate instanceof Date ? customDate : new Date(customDate);
    return isNaN(d.getTime()) ? null : d;
  }

  if (record.createdAt) {
    const d = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);
    if (!isNaN(d.getTime())) return d;
  }

  if (record._id) {
    const idStr = String(record._id).trim();
    if (idStr.length >= 8 && /^[0-9a-fA-F]{8}/.test(idStr)) {
      try {
        const d = new Date(parseInt(idStr.substring(0, 8), 16) * 1000);
        if (!isNaN(d.getTime())) return d;
      } catch (e) {}
    }
  }

  const fallbackVal =
    record.rawDate || record.paymentDateRaw || record.paymentDate ||
    record.loan_start_date || record.date;

  if (fallbackVal) {
    const d = fallbackVal instanceof Date ? fallbackVal : new Date(fallbackVal);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
};

export const isRecordNewForUser = (record, user, customDate = null) => {
  if (!record) return false;
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return true;

  const joinDate = getUserJoinDate(currentUser);
  if (!joinDate) return true;

  const rDate = getRecordTimestamp(record, customDate);
  if (!rDate) return false;

  return rDate.getTime() >= joinDate.getTime();
};

export const filterPaymentsForUser = (payments, user) => {
  if (!Array.isArray(payments)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser || (currentUser.role || '').toLowerCase() === 'admin') {
    return payments;
  }
  return payments.filter(p => isRecordNewForUser(p, currentUser));
};

export const filterClientsForUser = (clients, user) => {
  if (!Array.isArray(clients)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser || (currentUser.role || '').toLowerCase() === 'admin') {
    return clients;
  }
  return clients.filter(c => isRecordNewForUser(c, currentUser));
};

// --------------------------------------------------------------------------
// Manager-assignment based filtering (layered ON TOP of join-date filtering).
// BACKWARD-COMPATIBLE: if no managerId linkage exists in data, passes through.
// --------------------------------------------------------------------------

export const getManagerId = (user) => {
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return null;
  const role = (currentUser.role || '').toLowerCase();
  if (role !== 'manager') return null;
  return String(currentUser._id || currentUser.id || '').trim() || null;
};

const agentBelongsToManager = (agent, managerId) => {
  if (!agent || !managerId) return true;
  const agentManagerId =
    agent.managerId ||
    agent.manager_id ||
    (agent.manager
      ? (typeof agent.manager === 'object'
          ? (agent.manager._id || agent.manager.id)
          : agent.manager)
      : null) ||
    null;
  if (!agentManagerId) return true;
  return String(agentManagerId).trim() === managerId;
};

export const filterAgentsForManager = (agents, user) => {
  if (!Array.isArray(agents)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return agents;
  const role = (currentUser.role || '').toLowerCase();
  if (role === 'admin') return agents;
  if (role !== 'manager') return agents;
  const managerId = getManagerId(currentUser);
  if (!managerId) return agents;
  const hasAnyManagerId = agents.some(a => {
    const mid =
      a.managerId ||
      a.manager_id ||
      (a.manager
        ? (typeof a.manager === 'object' ? (a.manager._id || a.manager.id) : a.manager)
        : null);
    return !!mid;
  });
  if (!hasAnyManagerId) return agents;
  return agents.filter(agent => agentBelongsToManager(agent, managerId));
};

export const clientBelongsToManager = (client, user, myAgents = []) => {
  if (!client) return false;
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return true;
  const role = (currentUser.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (role !== 'manager') return true;

  const managerId = String(currentUser._id || currentUser.id || '').trim();
  const managerName = (currentUser.name || currentUser.username || '').trim().toLowerCase();

  // Helper: extract raw managerId value from client (before stringifying to avoid null -> 'null')
  const rawManagerId =
    client.managerId ||
    client.addedBy ||
    (client.manager
      ? (typeof client.manager === 'object' ? (client.manager._id || client.manager.id) : client.manager)
      : undefined) ||
    client.manager_id ||
    client.createdBy ||
    undefined;

  // 1. Explicit manager ID check on client
  // Only compare when the raw value is a non-null/non-empty identifier
  if (rawManagerId !== undefined && rawManagerId !== null && rawManagerId !== '') {
    const cManagerId = String(rawManagerId).trim();
    if (cManagerId) {
      if (managerId && cManagerId === managerId) return true;
      // Belongs to a different manager — do NOT show
      return false;
    }
  }

  // 1b. If client has managerId/addedBy field explicitly set to null (backend tracked but unassigned),
  // treat as "owned by nobody" — fall through to name/agent checks but NOT date fallback.
  const hasManagerIdField = 'managerId' in client || 'addedBy' in client;

  // 2. Explicit manager name check on client
  const rawManagerName =
    client.managerName ||
    client.manager_name ||
    client.addedByName ||
    undefined;

  if (rawManagerName !== undefined && rawManagerName !== null && rawManagerName !== '') {
    const cManagerName = String(rawManagerName).trim().toLowerCase();
    if (cManagerName && managerName) {
      if (cManagerName === managerName) return true;
      return false;
    }
  }

  // 3. Fallback for legacy clients without explicit manager tag: check agent assignment
  if (Array.isArray(myAgents) && myAgents.length > 0) {
    const myAgentIds = new Set(
      myAgents.map(a => String(a._id || a.id || '').trim()).filter(Boolean)
    );
    const myAgentNames = new Set(
      myAgents.map(a => (a.name || a.username || '').trim().toLowerCase()).filter(Boolean)
    );

    const clientAgentId = String(
      (client.assigned_agent
        ? (typeof client.assigned_agent === 'object' ? (client.assigned_agent._id || client.assigned_agent.id || client.assigned_agent.$oid) : client.assigned_agent)
        : null) ||
      client.agentId || client.agent_id ||
      (client.agent
        ? (typeof client.agent === 'object' ? (client.agent._id || client.agent.id || client.agent.$oid) : client.agent)
        : null) ||
      ''
    ).trim();

    const clientAgentName = String(
      client.assigned_agent_name || client.agentName ||
      (client.assigned_agent && typeof client.assigned_agent === 'object' ? (client.assigned_agent.name || client.assigned_agent.username) : '') ||
      (client.agent && typeof client.agent === 'object' ? (client.agent.name || client.agent.username) : '') ||
      ''
    ).trim().toLowerCase();

    if (clientAgentId && myAgentIds.has(clientAgentId)) {
      return isRecordNewForUser(client, currentUser);
    }
    if (clientAgentName && myAgentNames.has(clientAgentName)) {
      return isRecordNewForUser(client, currentUser);
    }
    // If agent link is present and belongs to another manager's agent, exclude
    if (clientAgentId || clientAgentName) return false;
  }

  // 4. Date-based fallback ONLY for truly legacy clients (no manager ownership fields at all).
  // If the client has managerId/addedBy fields (even if null), skip the date fallback
  // to prevent Manager2 from seeing Manager1's clients through the date loophole.
  if (hasManagerIdField) return false;

  return isRecordNewForUser(client, currentUser);
};

export const filterClientsForManager = (clients, myAgents, user) => {
  if (!Array.isArray(clients)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return clients;
  const role = (currentUser.role || '').toLowerCase();
  if (role === 'admin') return clients;
  if (role !== 'manager') return filterClientsForUser(clients, currentUser);

  return clients.filter(client => clientBelongsToManager(client, currentUser, myAgents));
};

export const filterPaymentsForManager = (payments, myAgents, user, scopedClients = null) => {
  if (!Array.isArray(payments)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return payments;
  const role = (currentUser.role || '').toLowerCase();
  if (role === 'admin') return payments;
  if (role !== 'manager') return filterPaymentsForUser(payments, currentUser);

  const managerId = String(currentUser._id || currentUser.id || '').trim();
  const managerName = (currentUser.name || currentUser.username || '').trim().toLowerCase();

  // Pre-build set of allowed client IDs/phones if scopedClients was provided
  let allowedClientIds = null;
  let allowedClientPhones = null;
  if (Array.isArray(scopedClients) && scopedClients.length > 0) {
    allowedClientIds = new Set(
      scopedClients.map(c => String(c._id || c.id || c.clientId || (c._id && c._id.$oid) || '').trim()).filter(Boolean)
    );
    allowedClientPhones = new Set(
      scopedClients.map(c => String(c.phone || '').trim()).filter(Boolean)
    );
  }

  // Pre-build set of allowed agent IDs/names
  const hasAgents = Array.isArray(myAgents) && myAgents.length > 0;
  const myAgentIds = hasAgents
    ? new Set(myAgents.map(a => String(a._id || a.id || (a._id && a._id.$oid) || '').trim()).filter(Boolean))
    : null;
  const myAgentNames = hasAgents
    ? new Set(myAgents.map(a => (a.name || a.username || '').trim().toLowerCase()).filter(Boolean))
    : null;

  return payments.filter(payment => {
    if (!payment) return false;

    // Join date filter: don't show records before manager joined
    if (!isRecordNewForUser(payment, currentUser)) return false;

    // Helper: check if payment date is on/after agent's assignment date to this manager
    const isAfterAssignment = (matchedAgent) => {
      if (!matchedAgent || !matchedAgent.managerAssignedAt) return true;
      const assignedAt = new Date(matchedAgent.managerAssignedAt);
      if (isNaN(assignedAt.getTime())) return true;

      const payCreatedAt = payment.createdAt ? new Date(payment.createdAt) : null;
      const payScheduledDate = payment.paymentDate ? new Date(payment.paymentDate) : null;
      const payRawDate = payment.rawDate ? new Date(payment.rawDate) : null;

      const validDates = [payCreatedAt, payScheduledDate, payRawDate].filter(d => d && !isNaN(d.getTime()));
      if (validDates.length === 0) return true;

      // Allow if any payment timestamp is on or after assignment timestamp
      if (validDates.some(d => d.getTime() >= assignedAt.getTime())) return true;

      // Also allow if payment was recorded/dated on the same calendar day as assignment
      const assignedYMD = `${assignedAt.getFullYear()}-${String(assignedAt.getMonth() + 1).padStart(2, '0')}-${String(assignedAt.getDate()).padStart(2, '0')}`;
      const isSameDay = validDates.some(d => {
        const dYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dYMD === assignedYMD;
      });
      if (isSameDay) return true;

      return false;
    };

    // Helper: check if the collecting agent on this payment is one of this manager's assigned agents
    const checkAgentAssignment = () => {
      if (!hasAgents) return false;

      const payAgentId = String(
        (payment.agent
          ? (typeof payment.agent === 'object' ? (payment.agent._id || payment.agent.id || payment.agent.$oid) : payment.agent)
          : null) ||
        payment.collectedStaffId ||
        (payment.staff ? payment.staff.id : null) ||
        ''
      ).trim();

      const payAgentName = String(
        (payment.agent && typeof payment.agent === 'object' ? (payment.agent.name || payment.agent.username) : '') ||
        payment.collectedStaff ||
        (payment.staff ? payment.staff.name : '') ||
        ''
      ).trim().toLowerCase();

      if (payAgentId && myAgentIds.has(payAgentId)) {
        const matchedAgent = myAgents.find(a => String(a._id || a.id || (a._id && a._id.$oid) || '').trim() === payAgentId);
        return isAfterAssignment(matchedAgent);
      }
      if (payAgentName && myAgentNames.has(payAgentName)) {
        const matchedAgent = myAgents.find(a =>
          (a.name || a.username || '').trim().toLowerCase() === payAgentName
        );
        return isAfterAssignment(matchedAgent);
      }
      return false;
    };

    // 1. Direct manager ID check on payment
    // NOTE: payment.managerId = client's manager (set by Payment pre-save hook),
    // NOT necessarily the collecting agent's manager. So we ALSO check agent
    // assignment before blocking, so assigned-agent payments are never missed.
    const pManagerId = String(
      payment.managerId ||
      payment.manager_id ||
      (payment.manager
        ? (typeof payment.manager === 'object' ? (payment.manager._id || payment.manager.id) : payment.manager)
        : null) ||
      payment.addedByManager ||
      ''
    ).trim();

    if (pManagerId) {
      if (managerId && pManagerId === managerId) return true;
      // Client belongs to another manager — still show if OUR assigned agent collected it
      return checkAgentAssignment();
    }

    // 2. Client-based check (a payment belongs to the manager who added the client)
    const pClientObj = (payment.client && typeof payment.client === 'object') ? payment.client : null;
    const pClientId = String(
      (pClientObj ? (pClientObj._id || pClientObj.id) : payment.client) ||
      payment.clientId ||
      ''
    ).trim();
    const pClientPhone = String(payment.clientPhone || (pClientObj ? pClientObj.phone : '') || '').trim();

    // If client object carries managerId
    if (pClientObj) {
      const cMid = String(pClientObj.managerId || pClientObj.addedBy || pClientObj.manager || '').trim();
      if (cMid) {
        if (managerId && cMid === managerId) return true;
        // Client under another manager — still show if OUR assigned agent collected it
        return checkAgentAssignment();
      }
    }

    // If scoped clients list is provided
    if (allowedClientIds && allowedClientIds.size > 0) {
      if (pClientId && allowedClientIds.has(pClientId)) return true;
      if (pClientPhone && allowedClientPhones && allowedClientPhones.has(pClientPhone)) return true;
      if (pClientId) return checkAgentAssignment(); // fallback to agent check
    }

    // 3. Direct collector check (manager collected it personally)
    const collectorId = String(payment.collectedStaffId || (payment.staff ? payment.staff.id : '') || '').trim();
    const collectorName = String(payment.collectedStaff || (payment.staff ? payment.staff.name : '') || '').trim().toLowerCase();
    if (managerId && collectorId === managerId) return true;
    if (managerName && collectorName && collectorName === managerName) return true;

    // 4. Agent assignment check
    return checkAgentAssignment();
  });
};


// --------------------------------------------------------------------------
// Agent-identity based filtering for the agent-side views.
// BACKWARD-COMPATIBLE: if no clients have assigned_agent field, returns date-filtered list.
// --------------------------------------------------------------------------

export const filterClientsForAgent = (clients, user) => {
  if (!Array.isArray(clients)) return [];
  const currentUser = user || getLoggedInUser();
  if (!currentUser) return clients;
  const role = (currentUser.role || '').toLowerCase();
  if (role === 'admin') return clients;
  const dateFiltered = filterClientsForUser(clients, currentUser);
  if (role !== 'agent') return dateFiltered;
  const agentId = String(currentUser._id || currentUser.id || '').trim();
  const agentName = (currentUser.name || currentUser.username || '').trim().toLowerCase();
  if (!agentId && !agentName) return dateFiltered;
  const hasAgentLink = dateFiltered.some(c =>
    c.assigned_agent || c.agent || c.agentId || c.agent_id || c.assigned_agent_name || c.agentName
  );
  if (!hasAgentLink) return dateFiltered;
  return dateFiltered.filter(client => {
    const cAgentId =
      (client.assigned_agent ? (typeof client.assigned_agent === 'object'
        ? (client.assigned_agent._id || client.assigned_agent.id) : client.assigned_agent) : null) ||
      client.agentId || client.agent_id ||
      (client.agent ? (typeof client.agent === 'object'
        ? (client.agent._id || client.agent.id) : client.agent) : null) || null;
    if (cAgentId && agentId && String(cAgentId).trim() === agentId) return true;
    const cAgentName = (
      client.assigned_agent_name || client.agentName ||
      (client.assigned_agent && typeof client.assigned_agent === 'object'
        ? (client.assigned_agent.name || client.assigned_agent.username) : '') ||
      (client.agent && typeof client.agent === 'object'
        ? (client.agent.name || client.agent.username) : '') || ''
    ).trim().toLowerCase();
    if (cAgentName && agentName && cAgentName.includes(agentName)) return true;
    return !cAgentId && !cAgentName;
  });
};
