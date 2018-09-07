/* global ListIssue */

import { __ } from '~/locale';
import ListLabel from '~/vue_shared/models/label';
import ListAssignee from '~/vue_shared/models/assignee';
import { urlParamsToObject } from '~/lib/utils/common_utils';

const PER_PAGE = 20;

const TYPES = {
  backlog: {
    isPreset: true,
    isExpandable: true,
    isBlank: false,
  },
  closed: {
    isPreset: true,
    isExpandable: true,
    isBlank: false,
  },
  blank: {
    isPreset: true,
    isExpandable: false,
    isBlank: true,
  },
};

class List {
  constructor(obj, defaultAvatar) {
    this.id = obj.id;
    this.position = obj.position;
    this.title = obj.list_type === 'backlog' ? __('Open') : obj.title;
    this.type = obj.list_type;

    const typeInfo = List.getTypeInfo(this.type);
    this.preset = !!typeInfo.isPreset;
    this.isExpandable = !!typeInfo.isExpandable;
    this.isExpanded = true;
    this.page = 1;
    this.loading = true;
    this.loadingMore = false;
    this.issues = [];
    this.issuesSize = 0;
    this.defaultAvatar = defaultAvatar;

    if (obj.label) {
      this.label = new ListLabel(obj.label);
    } else if (obj.user) {
      this.assignee = new ListAssignee(obj.user);
      this.title = this.assignee.name;
    }

    if (!typeInfo.isBlank && this.id) {
      this.getIssues().catch(() => {
        // TODO: handle request error
      });
    }
  }

  save() {
    const entity = this.label || this.assignee;
    let entityType = '';
    if (this.label) {
      entityType = 'label_id';
    } else {
      entityType = 'assignee_id';
    }

    return gl.boardService
      .createList(entity.id, entityType)
      .then(res => res.data)
      .then(data => {
        this.id = data.id;
        this.type = data.list_type;
        this.position = data.position;

        return this.getIssues();
      });
  }

  destroy() {
    const index = gl.issueBoards.BoardsStore.state.lists.indexOf(this);
    gl.issueBoards.BoardsStore.state.lists.splice(index, 1);
    gl.issueBoards.BoardsStore.updateNewListDropdown(this.id);

    gl.boardService.destroyList(this.id).catch(() => {
      // TODO: handle request error
    });
  }

  update() {
    gl.boardService.updateList(this.id, this.position).catch(() => {
      // TODO: handle request error
    });
  }

  nextPage() {
    if (this.issuesSize > this.issues.length) {
      if (this.issues.length / PER_PAGE >= 1) {
        this.page += 1;
      }

      return this.getIssues(false);
    }

    return null;
  }

  getIssues(emptyIssues = true) {
    const data = {
      ...urlParamsToObject(gl.issueBoards.BoardsStore.filter.path),
      page: this.page,
    };

    if (this.label && data.label_name) {
      data.label_name = data.label_name.filter(label => label !== this.label.title);
    }

    if (emptyIssues) {
      this.loading = true;
    }

    return gl.boardService
      .getIssuesForList(this.id, data)
      .then(res => res.data)
      .then(({ size, issues }) => {
        this.loading = false;
        this.issuesSize = size;

        if (emptyIssues) {
          this.issues = [];
        }

        this.createIssues(issues);

        return data;
      });
  }

  newIssue(issue) {
    this.addIssue(issue, null, 0);
    this.issuesSize += 1;

    return gl.boardService
      .newIssue(this.id, issue)
      .then(res => res.data)
      .then(data => this.onNewIssueResponse(issue, data));
  }

  createIssues(data) {
    data.forEach(issueObj => {
      this.addIssue(new ListIssue(issueObj, this.defaultAvatar));
    });
  }

  addIssue(issue, listFrom, newIndex) {
    let moveBeforeId = null;
    let moveAfterId = null;

    if (!this.findIssue(issue.id)) {
      if (newIndex !== undefined) {
        this.issues.splice(newIndex, 0, issue);

        if (this.issues[newIndex - 1]) {
          moveBeforeId = this.issues[newIndex - 1].id;
        }

        if (this.issues[newIndex + 1]) {
          moveAfterId = this.issues[newIndex + 1].id;
        }
      } else {
        this.issues.push(issue);
      }

      if (this.label) {
        issue.addLabel(this.label);
      }

      if (this.assignee) {
        if (listFrom && listFrom.type === 'assignee') {
          issue.removeAssignee(listFrom.assignee);
        }
        issue.addAssignee(this.assignee);
      }

      if (listFrom) {
        this.issuesSize += 1;

        this.updateIssueLabel(issue, listFrom, moveBeforeId, moveAfterId);
      }
    }
  }

  moveIssue(issue, oldIndex, newIndex, moveBeforeId, moveAfterId) {
    this.issues.splice(oldIndex, 1);
    this.issues.splice(newIndex, 0, issue);

    gl.boardService.moveIssue(issue.id, null, null, moveBeforeId, moveAfterId).catch(() => {
      // TODO: handle request error
    });
  }

  updateIssueLabel(issue, listFrom, moveBeforeId, moveAfterId) {
    gl.boardService
      .moveIssue(issue.id, listFrom.id, this.id, moveBeforeId, moveAfterId)
      .catch(() => {
        // TODO: handle request error
      });
  }

  findIssue(id) {
    return this.issues.find(issue => issue.id === id);
  }

  removeIssue(removeIssue) {
    this.issues = this.issues.filter(issue => {
      const matchesRemove = removeIssue.id === issue.id;

      if (matchesRemove) {
        this.issuesSize -= 1;
        issue.removeLabel(this.label);
      }

      return !matchesRemove;
    });
  }

  static getTypeInfo(type) {
    return TYPES[type] || {};
  }

  onNewIssueResponse(issue, data) {
    Object.assign(issue, {
      id: data.id,
      iid: data.iid,
      project: data.project,
      path: data.real_path,
      referencePath: data.reference_path,
    });

    if (this.issuesSize > 1) {
      const moveBeforeId = this.issues[1].id;
      gl.boardService.moveIssue(issue.id, null, null, null, moveBeforeId);
    }
  }
}

window.List = List;

export default List;
